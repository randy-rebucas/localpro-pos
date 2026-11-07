import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { requireAuth } from '@/lib/auth'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { isChannelOrder, voidSale, VoidConflictError, VoidVariationUnknownError, type VoidSaleResult } from '@/lib/void-sale';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
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
    
    const transaction = await Transaction.findOne({ _id: id, tenantId, isActive: { $ne: false } })
      // Bundle lines and deleted products have no Product doc; keep their id instead of null
      .populate({ path: 'items.product', select: 'name sku', transform: (doc, id) => doc ?? id })
      .populate('userId', 'name email')
      .lean();
    
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
    await connectDB();
    // SECURITY: Validate tenant access for authenticated requests
    let tenantId: string;
    let userId: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      userId = tenantAccess.user.userId;
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

    const transaction = await Transaction.findOne({ _id: id, tenantId });
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
      const { allowed } = checkRateLimit(`transactions:void:${tenantId}`, 30, 60_000);
      if (!allowed) {
        return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
      }

      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
      if (!reason) {
        return NextResponse.json({ success: false, error: t('validation.voidReasonRequired', 'A reason is required to void a sale') }, { status: 400 });
      }
      if (isChannelOrder(transaction)) {
        return NextResponse.json(
          { success: false, error: t('validation.voidChannelOrder', 'Online store orders cannot be voided here. Refund the order instead.') },
          { status: 400 }
        );
      }

      let result: VoidSaleResult;
      try {
        // The atomic claim inside guards against a concurrent void or refund, and
        // refundCount blocks a partly refunded sale, which stays 'completed'.
        result = await voidSale({ tenantId, sale: transaction, userId, reason });
      } catch (voidError: unknown) {
        if (voidError instanceof VoidConflictError) {
          return NextResponse.json(
            { success: false, error: t('validation.transactionAlreadyFinalized', 'This transaction has already been voided or refunded and cannot be modified') },
            { status: 409 }
          );
        }
        if (voidError instanceof VoidVariationUnknownError) {
          return NextResponse.json(
            { success: false, error: t('validation.voidVariationUnknown', 'This older sale did not record which variation was sold, so stock cannot be returned automatically. Refund the sale instead.') },
            { status: 409 }
          );
        }
        throw voidError;
      }

      if (result.productIds.length > 0) {
        const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
        void pushChannelInventoryForProducts(tenantId, result.productIds, { stockReason: reason });
      }

      await createAuditLog(request, {
        tenantId,
        action: AuditActions.TRANSACTION_CANCEL,
        entityType: 'transaction',
        entityId: id,
        changes: {
          status: { old: transaction.status, new: 'cancelled' },
          reason,
          onAccountReversed: result.onAccountReversed,
          loyaltyPointsReversed: result.loyaltyPointsReversed,
          discountReleased: result.discountReleased,
        },
      });

      return NextResponse.json({ success: true, data: result.transaction });
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

