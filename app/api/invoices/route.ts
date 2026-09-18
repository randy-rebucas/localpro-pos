import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/receipt';

export async function GET(request: NextRequest) {
  try {
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      const msg = (authError as Error).message ?? '';
      return NextResponse.json(
        { success: false, error: msg },
        { status: msg.includes('Unauthorized') ? 401 : 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const skip = (page - 1) * limit;
    const status = searchParams.get('status');
    const customerId = searchParams.get('customerId');
    const overdue = searchParams.get('overdue') === 'true';

    const where: any = { tenantId, isActive: { not: false } }; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (status) {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (overdue) {
      where.status = { in: ['sent', 'draft'] };
      where.dueDate = { lt: new Date() };
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
        include: {
          transaction: { select: { receiptNumber: true, total: true } },
          customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
          items: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    if (!(await hasTenantPermission(user.role, tenantId, 'invoices.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

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
      const transaction = await prisma.transaction.findFirst({
        where: { id: transactionId, tenantId },
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
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        include: { addresses: true },
      });

      if (customer) {
        const defaultAddress = customer.addresses.length > 0
          ? customer.addresses.find((addr) => addr.isDefault) || customer.addresses[0]
          : undefined;
        finalCustomerInfo = {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          phone: customer.phone,
          address: defaultAddress,
        };
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(tenantId);

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        id: randomUUID(),
        tenantId,
        invoiceNumber,
        transactionId: transactionId || undefined,
        customerId: customerId || undefined,
        snapshotName: finalCustomerInfo?.name,
        snapshotEmail: finalCustomerInfo?.email,
        snapshotPhone: finalCustomerInfo?.phone,
        snapshotAddressStreet: finalCustomerInfo?.address?.street,
        snapshotAddressCity: finalCustomerInfo?.address?.city,
        snapshotAddressState: finalCustomerInfo?.address?.state,
        snapshotAddressZipCode: finalCustomerInfo?.address?.zipCode,
        snapshotAddressCountry: finalCustomerInfo?.address?.country,
        items: {
          create: items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            id: randomUUID(),
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
          })),
        },
        subtotal,
        discountAmount: discountAmount || undefined,
        taxAmount,
        total,
        dueDate: new Date(dueDate),
        paymentTerms: paymentTerms || 'Due on receipt',
        status: 'draft',
        notes: notes || undefined,
      },
      include: { items: true },
    });

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.INVOICE_CREATE,
      entityType: 'invoice',
      entityId: invoice.id,
      changes: {
        invoiceNumber,
        customerId: customerId?.toString(),
        transactionId: transactionId?.toString(),
        total,
      },
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
