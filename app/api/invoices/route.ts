import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/receipt';
import { serializeInvoice } from '@/lib/data/invoices';
import { Prisma } from '@prisma/client';

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

    const where: Prisma.InvoiceWhereInput = { tenantId, isActive: true };

    if (status) {
      where.status = status as Prisma.InvoiceWhereInput['status'];
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
          transaction: { select: { id: true, receiptNumber: true, total: true } },
          customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: invoices.map(serializeInvoice),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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
      customerInfo,
    } = body;

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

    let finalCustomerInfo = customerInfo;
    if (customerId && !customerInfo) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (customer) {
        const addresses = Array.isArray(customer.addresses) ? (customer.addresses as Array<{ isDefault?: boolean }>) : [];
        finalCustomerInfo = {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          phone: customer.phone,
          address: addresses.length > 0 ? (addresses.find((addr) => addr.isDefault) || addresses[0]) : undefined,
        };
      }
    }

    const invoiceNumber = await generateInvoiceNumber(tenantId);

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        transactionId: transactionId || undefined,
        customerId: customerId || undefined,
        customerInfo: finalCustomerInfo ?? undefined,
        items,
        subtotal,
        discountAmount: discountAmount || undefined,
        taxAmount,
        total,
        dueDate: new Date(dueDate),
        paymentTerms: paymentTerms || 'Due on receipt',
        status: 'draft',
        notes: notes || undefined,
      },
    });

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

    return NextResponse.json({ success: true, data: serializeInvoice(invoice) }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
