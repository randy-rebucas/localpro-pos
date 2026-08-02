import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { serializeInvoice } from '@/lib/data/invoices';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        transaction: { select: { id: true, receiptNumber: true, total: true, items: true } },
        customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, addresses: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: serializeInvoice(invoice) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    if (!(await hasTenantPermission(user.role, tenantId, 'invoices.update_status'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;

    const body = await request.json();
    const { status, notes, paidAmount } = body;

    const existing = await prisma.invoice.findFirst({ where: { id, tenantId } });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const previousStatus = existing.status;
    const changes: Record<string, unknown> = {};
    const data: Record<string, unknown> = {};

    if (status && ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(status)) {
      data.status = status;
      changes.status = status;

      if (status === 'paid') {
        const paidAt = new Date();
        const finalPaidAmount = paidAmount || Number(existing.total);
        data.paidAt = paidAt;
        data.paidAmount = finalPaidAmount;
        changes.paidAt = paidAt;
        changes.paidAmount = finalPaidAmount;
      }
    }

    if (notes !== undefined) {
      data.notes = notes;
      changes.notes = notes;
    }

    const invoice = await prisma.invoice.update({ where: { id }, data });

    let auditAction: typeof AuditActions.INVOICE_UPDATE | typeof AuditActions.INVOICE_SEND | typeof AuditActions.INVOICE_MARK_PAID = AuditActions.INVOICE_UPDATE;
    if (status === 'sent' && previousStatus !== 'sent') {
      auditAction = AuditActions.INVOICE_SEND;
    } else if (status === 'paid' && previousStatus !== 'paid') {
      auditAction = AuditActions.INVOICE_MARK_PAID;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: auditAction,
      entityType: 'invoice',
      entityId: invoice.id,
      changes,
    });

    return NextResponse.json({ success: true, data: serializeInvoice(invoice) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update invoice';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
