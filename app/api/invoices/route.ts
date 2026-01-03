import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Transaction from '@/models/Transaction';
import Customer from '@/models/Customer';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/receipt';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = (page - 1) * limit;
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const overdue = searchParams.get('overdue') === 'true';

    const query: any = { tenantId };
    
    if (status) {
      query.status = status;
    }
    
    if (customerId) {
      query.customerId = customerId;
    }
    
    if (overdue) {
      query.status = { $in: ['sent', 'draft'] };
      query.dueDate = { $lt: new Date() };
    }

    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('transactionId', 'receiptNumber total')
      .populate('customerId', 'name email phone')
      .lean();

    const total = await Invoice.countDocuments(query);

    return NextResponse.json({
      success: true,
      data: invoices || [],
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    
    const body = await request.json();
    const { 
      transactionId, 
      customerId, 
      items, 
      subtotal, 
      discountAmount, 
      taxAmount, 
      total, 
      dueDate, 
      paymentTerms, 
      notes,
      customerInfo 
    } = body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invoice items are required' },
        { status: 400 }
      );
    }

    if (!subtotal || !taxAmount || !total || !dueDate) {
      return NextResponse.json(
        { success: false, error: 'Subtotal, tax amount, total, and due date are required' },
        { status: 400 }
      );
    }

    // If transactionId provided, verify it exists and belongs to tenant
    if (transactionId) {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        tenantId,
      });

      if (!transaction) {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 }
        );
      }
    }

    // If customerId provided, get customer info
    let finalCustomerInfo = customerInfo;
    if (customerId && !customerInfo) {
      const customer = await Customer.findOne({
        _id: customerId,
        tenantId,
      }).lean();

      if (customer) {
        finalCustomerInfo = {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          phone: customer.phone,
          address: customer.addresses && customer.addresses.length > 0 
            ? customer.addresses.find((addr: any) => addr.isDefault) || customer.addresses[0]
            : undefined,
        };
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(tenantId);

    // Create invoice
    const invoice = await Invoice.create({
      tenantId,
      invoiceNumber,
      transactionId: transactionId || undefined,
      customerId: customerId || undefined,
      customerInfo: finalCustomerInfo,
      items,
      subtotal,
      discountAmount: discountAmount || undefined,
      taxAmount,
      total,
      dueDate: new Date(dueDate),
      paymentTerms: paymentTerms || 'Due on receipt',
      status: 'draft',
      notes: notes || undefined,
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.INVOICE_CREATE,
      entityType: 'invoice',
      entityId: invoice._id.toString(),
      changes: {
        invoiceNumber,
        customerId: customerId?.toString(),
        transactionId: transactionId?.toString(),
        total,
      },
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
