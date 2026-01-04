import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found or access denied' }, { status: 403 });
    }

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
    })
      .populate('transactionId', 'receiptNumber total items')
      .populate('customerId', 'name email phone address')
      .lean();

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get invoice' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const tenantAccess = await requireTenantAccess(request);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId, user: _user } = tenantAccess;
    const { id } = await params;
    
    const body = await request.json();
    const { status, notes, paidAmount } = body;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const previousStatus = invoice.status;
    const changes: Record<string, unknown> = {};

    // Update status if provided
    if (status && ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(status)) {
      invoice.status = status;
      changes.status = status;

      // If marking as paid, update paid fields
      if (status === 'paid') {
        invoice.paidAt = new Date();
        invoice.paidAmount = paidAmount || invoice.total;
        changes.paidAt = invoice.paidAt;
        changes.paidAmount = invoice.paidAmount;
      }
    }

    // Update notes if provided
    if (notes !== undefined) {
      invoice.notes = notes;
      changes.notes = notes;
    }

    await invoice.save();

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
      action: auditAction,
      entityType: 'invoice',
      entityId: invoice._id.toString(),
      changes,
    });

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
