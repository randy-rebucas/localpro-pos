import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';

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

    // Find payment
    const { payments, transactions } = getRepos();
    const payment = await payments.findById(tenantId, paymentId);

    if (!payment) {
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Check if already refunded
    if (payment.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Payment already refunded' },
        { status: 400 }
      );
    }

    // A payment tied to a still-active POS transaction must be refunded through
    // /api/transactions/[id]/refund, which also restores stock and credits any
    // on-account balance. Refunding it here would leave the transaction, stock,
    // and reports out of sync with the payment ledger.
    if (payment.transactionId) {
      const linkedTransaction = await transactions.findById(tenantId, payment.transactionId, {
        select: '_id',
        status: 'completed',
      });
      if (linkedTransaction) {
        return NextResponse.json(
          {
            success: false,
            error: 'This payment is linked to an active sale. Refund it via the transaction refund endpoint instead.',
          },
          { status: 409 }
        );
      }
    }

    // Atomic claim: guards against a double-submit/retry refunding the same
    // payment twice before either request's write lands.
    const claimed = await payments.markRefunded(tenantId, paymentId, { at: new Date(), reason: refundReason });
    if (!claimed) {
      return NextResponse.json(
        { success: false, error: 'Payment already refunded' },
        { status: 409 }
      );
    }

    // Create audit log
    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.PAYMENT_REFUND,
      entityType: 'payment',
      entityId: payment._id,
      changes: {
        status: 'refunded',
        refundReason,
      },
    });

    return NextResponse.json({ success: true, data: claimed });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to process refund';
    if (msg.includes('Unauthorized') || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg.includes('Unauthorized') ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
