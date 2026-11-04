import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Invoice, type Patch } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;

    if (!(await hasTenantPermission(user.role, tenantId, 'invoices.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const invoice = await getRepos().invoices.findDetail(tenantId, id);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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

    const { invoices } = getRepos();
    const invoice = await invoices.findById(tenantId, id);

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const previousStatus = invoice.status;
    const changes: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const patch: Patch<Pick<Invoice, 'status' | 'paidAt' | 'paidAmount' | 'notes'>> = {};

    // Update status if provided
    if (status && ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(status)) {
      patch.status = status;
      changes.status = status;

      // If marking as paid, update paid fields
      if (status === 'paid') {
        patch.paidAt = new Date();
        patch.paidAmount = paidAmount || invoice.total;
        changes.paidAt = patch.paidAt;
        changes.paidAmount = patch.paidAmount;
      }
    }

    // Update notes if provided
    if (notes !== undefined) {
      patch.notes = notes;
      changes.notes = notes;
    }

    const result = await invoices.update(tenantId, id, patch);
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Determine audit action
    let auditAction: typeof AuditActions.INVOICE_UPDATE | typeof AuditActions.INVOICE_SEND | typeof AuditActions.INVOICE_MARK_PAID = AuditActions.INVOICE_UPDATE;
    if (status === 'sent' && previousStatus !== 'sent') {
      auditAction = AuditActions.INVOICE_SEND;
    } else if (status === 'paid' && previousStatus !== 'paid') {
      auditAction = AuditActions.INVOICE_MARK_PAID;
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: auditAction,
      entityType: 'invoice',
      entityId: invoice._id,
      changes,
    });

    return NextResponse.json({ success: true, data: result.after });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
