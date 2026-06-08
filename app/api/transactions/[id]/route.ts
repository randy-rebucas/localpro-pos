import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import { getTenantIdFromRequest, requireTenantAccess } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { requireAuth, requireRole } from '@/lib/auth'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
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
      .populate('items.product', 'name sku')
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
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      // Also check role
      await requireRole(request, ['admin', 'manager']);
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

    // Only allow status updates (void/refund) on completed transactions
    if (body.status && ['cancelled', 'refunded'].includes(body.status)) {
      const oldStatus = transaction.status;
      transaction.status = body.status;
      await transaction.save();

      // If refunding, restore stock (only if product tracks inventory)
      if (body.status === 'refunded' && oldStatus === 'completed') {
        const restoredIds: string[] = [];
        for (const item of transaction.items) {
          const product = await Product.findOne({ _id: item.product.toString(), tenantId });
          if (product && product.trackInventory !== false) {
            const restoreQty = item.baseQuantity ?? item.quantity * (item.unitFactor ?? 1);
            await updateStock(
              item.product.toString(),
              tenantId,
              restoreQty,
              'return',
              {
                transactionId: transaction._id.toString(),
                reason: 'Transaction refund',
              }
            );
            restoredIds.push(item.product.toString());
          }
        }
        if (restoredIds.length) {
          const { pushChannelInventoryForProducts } = await import('@/lib/ecommerce/inventory-push');
          void pushChannelInventoryForProducts(tenantId, restoredIds, { stockReason: 'Transaction refund' });
        }
      }

      await createAuditLog(request, {
        tenantId,
        action: body.status === 'refunded' ? AuditActions.TRANSACTION_REFUND : AuditActions.TRANSACTION_CANCEL,
        entityType: 'transaction',
        entityId: id,
        changes: { status: { old: oldStatus, new: body.status } },
      });

      return NextResponse.json({ success: true, data: transaction });
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

