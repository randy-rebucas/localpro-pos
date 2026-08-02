import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTenantAccess } from '@/lib/api-tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { requireAuth } from '@/lib/auth'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateStock } from '@/lib/stock';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTransaction(t: any): Record<string, unknown> {
  const { id, items, user, ...rest } = t;
  const out: Record<string, unknown> = { _id: id, ...rest };
  for (const key of ['subtotal', 'discountAmount', 'taxExemptAmount', 'zeroRatedAmount', 'taxAmount', 'total', 'cashReceived', 'change', 'displayTotal']) {
    if (out[key] !== null && out[key] !== undefined) out[key] = Number(out[key]);
  }
  if (items) {
    out.items = items.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      ...item,
      _id: item.id,
      product: item.product ? { _id: item.productId, name: item.product.name, sku: item.product.sku } : item.productId,
      price: Number(item.price),
      subtotal: Number(item.subtotal),
    }));
  }
  if (user) out.userId = { _id: t.userId, name: user.name, email: user.email };
  return out;
}

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
      where: { id, tenantId, isActive: true },
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        user: { select: { name: true, email: true } },
      },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: t('validation.transactionNotFound', 'Transaction not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeTransaction(transaction) });
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

    const transaction = await prisma.transaction.findFirst({ where: { id, tenantId }, include: { items: true } });
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
      const updated = await prisma.transaction.update({ where: { id: transaction.id }, data: { status: body.status } });

      // If refunding, restore stock (only if product tracks inventory)
      if (body.status === 'refunded' && oldStatus === 'completed') {
        const restoredIds: string[] = [];
        for (const item of transaction.items) {
          if (!item.productId) continue;
          const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId } });
          if (product && product.trackInventory !== false) {
            await updateStock(
              item.productId,
              tenantId,
              item.quantity, // Positive to restore
              'return',
              {
                transactionId: transaction.id,
                reason: 'Transaction refund',
              }
            );
            restoredIds.push(item.productId);
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

      return NextResponse.json({ success: true, data: serializeTransaction({ ...updated, items: transaction.items }) });
    }

    // Reject any other modifications to completed transactions
    if (transaction.status === 'completed') {
      return NextResponse.json(
        { success: false, error: t('validation.transactionImmutable', 'Completed transactions cannot be modified') },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: serializeTransaction(transaction) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'Unauthorized' || msg.includes('Forbidden')) {
      return NextResponse.json({ success: false, error: msg }, { status: msg === 'Unauthorized' ? 401 : 403 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
