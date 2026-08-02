import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { serializePayment } from '@/lib/data/payments';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantAccess = await requireTenantAccess(request);
    const { tenantId, user } = tenantAccess;
    if (!(await hasTenantPermission(user.role, tenantId, 'refunds.process'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id: paymentId } = await params;

    const { refundReason } = await request.json();

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    if (payment.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Payment already refunded' },
        { status: 400 }
      );
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'refunded',
        refundedAt: new Date(),
        ...(refundReason ? { refundReason } : {}),
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.PAYMENT_REFUND,
      entityType: 'payment',
      entityId: updated.id,
      changes: {
        status: 'refunded',
        refundReason,
      },
    });

    return NextResponse.json({ success: true, data: serializePayment(updated) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process refund';
    if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg.includes('Unauthorized') ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
