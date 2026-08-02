import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { generateInvoiceNumber } from '@/lib/receipt';
import { serializeInvoice } from '@/lib/data/invoices';

/**
 * Create an invoice from an existing transaction (for B2B scenarios)
 */
export async function POST(request: NextRequest) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;

    const body = await request.json();
    const { transactionId, customerId, dueDate, paymentTerms, notes } = body;

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
      include: { items: { include: { product: { select: { name: true } } } } },
    });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }

    let customerInfo = null;
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId },
      });

      if (customer) {
        const addresses = Array.isArray(customer.addresses) ? (customer.addresses as Array<{ isDefault?: boolean }>) : [];
        customerInfo = {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
          phone: customer.phone,
          address: addresses.length > 0 ? (addresses.find((addr) => addr.isDefault) || addresses[0]) : undefined,
        };
      }
    }

    const invoiceItems = transaction.items.map((item) => ({
      name: item.name,
      description: item.product?.name || '',
      quantity: item.quantity,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
    }));

    const invoiceDueDate = dueDate ? new Date(dueDate) : new Date();
    if (!dueDate) {
      invoiceDueDate.setDate(invoiceDueDate.getDate() + 30);
    }

    const invoiceNumber = await generateInvoiceNumber(tenantId);

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        transactionId: transaction.id,
        customerId: customerId || undefined,
        customerInfo: customerInfo ?? undefined,
        items: invoiceItems,
        subtotal: transaction.subtotal,
        discountAmount: transaction.discountAmount || undefined,
        taxAmount: transaction.taxAmount || 0,
        total: transaction.total,
        dueDate: invoiceDueDate,
        paymentTerms: paymentTerms || 'Net 30',
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
        transactionId: String(transactionId),
        customerId: customerId?.toString(),
        total: Number(transaction.total),
      },
    });

    return NextResponse.json({ success: true, data: serializeInvoice(invoice) }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
