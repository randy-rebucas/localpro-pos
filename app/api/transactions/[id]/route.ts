import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
    } catch (authError: unknown) {
      const authMsg = authError instanceof Error ? authError.message : '';
      if (authMsg.includes('Unauthorized') || authMsg.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authMsg },
          { status: authMsg.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const transaction = await prisma.transaction.findFirst({
      where: { id, tenantId, isActive: { not: false } },
      include: {
        items: { include: { product: { select: { name: true, sku: true } }, modifiers: true } },
        user: { select: { name: true, email: true } },
      },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'Unauthorized') {
      return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      if (!(await hasTenantPermission(tenantAccess.user.role, tenantId, 'transactions.edit'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (authError: unknown) {
      const authMsg = authError instanceof Error ? authError.message : '';
      if (authMsg.includes('Unauthorized') || authMsg.includes('Forbidden')) {
        return NextResponse.json(
          { success: false, error: authMsg },
          { status: authMsg.includes('Unauthorized') ? 401 : 403 }
        );
      }
      throw authError;
    }
    const { id } = await params;
    const body = await request.json();
    const t = await getValidationTranslatorFromRequest(request);

    const transaction = await prisma.transaction.findFirst({ where: { id, tenantId } });
    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }

    // BIR Compliance: Completed transactions are immutable.
    // Only status changes (void/refund) are allowed on completed transactions.
    // Cancelled/refunded transactions cannot be modified at all.
    if (transaction.status === 'cancelled' || transaction.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: t('validation.transactionAlreadyFinalized', 'This transaction has already been voided or refunded and cannot be modified') },
        { status: 400 }
      );
    }

    // Refunds must go through the dedicated refund endpoint — it also creates
    // the Payment refund record and credits any on-account balance, which this
    // route does not do. Allowing 'refunded' here would leave those out of sync.
    if (body.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Use POST /api/transactions/[id]/refund to process a refund' },
        { status: 400 }
      );
    }

    // Only allow void (cancel) on completed transactions
    if (body.status === 'cancelled') {
      // Atomic claim: guards against a concurrent void/refund racing on the
      // same transaction (double-click, retry) before either write lands.
      const claimResult = await prisma.transaction.updateMany({
        where: { id, tenantId, status: transaction.status },
        data: { status: 'cancelled' },
      });
      if (claimResult.count === 0) {
        return NextResponse.json(
          { success: false, error: t('validation.transactionAlreadyFinalized', 'This transaction has already been voided or refunded and cannot be modified') },
          { status: 409 }
        );
      }
      const claimed = await prisma.transaction.findFirst({ where: { id, tenantId } });
      const oldStatus = transaction.status;

      await createAuditLog(request, {
        tenantId,
        action: AuditActions.TRANSACTION_CANCEL,
        entityType: 'transaction',
        entityId: id,
        changes: { status: { old: oldStatus, new: 'cancelled' } },
      });

      return NextResponse.json({ success: true, data: claimed });
    }

    // Reject any other modifications to completed transactions
    if (transaction.status === 'completed') {
      return NextResponse.json(
        { success: false, error: t('validation.transactionImmutable', 'Completed transactions cannot be modified') },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: transaction });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'Unauthorized' || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
