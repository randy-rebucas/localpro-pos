import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Transaction from '@/models/Transaction';
import Customer from '@/models/Customer';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/receipt';

/**
 * Create an invoice from an existing transaction (for B2B scenarios)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess; // eslint-disable-line @typescript-eslint/no-unused-vars
    
    const body = await request.json();
    const { transactionId, customerId, dueDate, paymentTerms, notes } = body;

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Get transaction
    const transaction = await Transaction.findOne({
      _id: transactionId,
      tenantId,
    }).lean();

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Get customer info if customerId provided
    let customerInfo = null;
    if (customerId) {
      const customer = await Customer.findOne({
        _id: customerId,
        tenantId,
      }).lean();

      if (customer) {
        customerInfo = {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          phone: customer.phone,
          address: customer.addresses && customer.addresses.length > 0 
            ? customer.addresses.find((addr: any) => addr.isDefault) || customer.addresses[0] // eslint-disable-line @typescript-eslint/no-explicit-any
            : undefined,
        };
      }
    }

    // Convert transaction items to invoice items
    const invoiceItems = transaction.items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      name: item.name,
      description: item.product?.name || '',
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal,
    }));

    // Calculate due date (default to 30 days if not provided)
    const invoiceDueDate = dueDate ? new Date(dueDate) : new Date();
    if (!dueDate) {
      invoiceDueDate.setDate(invoiceDueDate.getDate() + 30);
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(tenantId);

    // Create invoice
    const invoice = await Invoice.create({
      tenantId,
      invoiceNumber,
      transactionId: transaction._id,
      customerId: customerId || undefined,
      customerInfo,
      items: invoiceItems,
      subtotal: transaction.subtotal,
      discountAmount: transaction.discountAmount || undefined,
      taxAmount: transaction.taxAmount || 0,
      total: transaction.total,
      dueDate: invoiceDueDate,
      paymentTerms: paymentTerms || 'Net 30',
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
        transactionId: transactionId.toString(),
        customerId: customerId?.toString(),
        total: transaction.total,
      },
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
