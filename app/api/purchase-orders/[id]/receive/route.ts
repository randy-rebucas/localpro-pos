import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST - Receive stock against a purchase order.
 * Body: { items: [{ itemId: string, quantityReceived: number }] } — quantityReceived is the
 * total received-to-date for that line (not a delta), so partial receipts across multiple
 * calls just resend the running total. Bumps Product.stock and logs a StockMovement per line,
 * then rolls the PO status to partially_received or received based on whether every line is full.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'purchase_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:purchase-orders:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }
    if (purchaseOrder.status === 'received' || purchaseOrder.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: `Cannot receive stock on a ${purchaseOrder.status} purchase order` },
        { status: 400 }
      );
    }
    if (purchaseOrder.status === 'draft') {
      return NextResponse.json(
        { success: false, error: 'Mark the purchase order as ordered before receiving stock' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }

    const itemsById = new Map(purchaseOrder.items.map((item) => [item.id, item]));

    const receipts: { itemId: string; productId: string; delta: number; newQuantityReceived: number; previousStock: number; newStock: number }[] = [];

    for (const entry of items as { itemId: string; quantityReceived: number }[]) {
      const poItem = itemsById.get(entry.itemId);
      if (!poItem) {
        return NextResponse.json({ success: false, error: `Purchase order item ${entry.itemId} not found` }, { status: 404 });
      }
      const newQuantityReceived = Math.trunc(Number(entry.quantityReceived));
      if (!Number.isFinite(newQuantityReceived) || newQuantityReceived < 0) {
        return NextResponse.json({ success: false, error: 'quantityReceived must be a non-negative number' }, { status: 400 });
      }
      if (newQuantityReceived > poItem.quantityOrdered) {
        return NextResponse.json(
          { success: false, error: `Cannot receive more than the ${poItem.quantityOrdered} ordered for this line` },
          { status: 400 }
        );
      }
      const delta = newQuantityReceived - poItem.quantityReceived;
      if (delta === 0) continue;

      const product = await prisma.product.findFirst({ where: { id: poItem.productId, tenantId } });
      if (!product) {
        return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
      }

      receipts.push({
        itemId: poItem.id,
        productId: poItem.productId,
        delta,
        newQuantityReceived,
        previousStock: product.stock,
        newStock: product.stock + delta,
      });
    }

    if (receipts.length === 0) {
      return NextResponse.json({ success: false, error: 'No change in received quantities' }, { status: 400 });
    }

    await dbTransaction(async (tx) => {
      for (const receipt of receipts) {
        await tx.purchaseOrderItem.update({
          where: { id: receipt.itemId },
          data: { quantityReceived: receipt.newQuantityReceived },
        });
        await tx.product.update({
          where: { id: receipt.productId },
          data: { stock: receipt.newStock },
        });
        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            productId: receipt.productId,
            tenantId,
            branchId: purchaseOrder.branchId || undefined,
            type: 'purchase',
            quantity: receipt.delta,
            previousStock: receipt.previousStock,
            newStock: receipt.newStock,
            reason: `Purchase order ${purchaseOrder.orderNumber}`,
            userId: user.userId,
          },
        });
      }

      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id } });
      const fullyReceived = allItems.every((item) => item.quantityReceived >= item.quantityOrdered);
      const anyReceived = allItems.some((item) => item.quantityReceived > 0);

      await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: {
          status: fullyReceived ? 'received' : anyReceived ? 'partially_received' : purchaseOrder.status,
          receivedAt: fullyReceived ? new Date() : undefined,
        },
      });
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'purchase_order',
      entityId: id,
      changes: { received: receipts.map((r) => ({ productId: r.productId, delta: r.delta })) },
    });

    const updated = await prisma.purchaseOrder.findFirst({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated
        ? {
            ...updated,
            _id: updated.id,
            totalAmount: Number(updated.totalAmount),
            items: updated.items.map((item) => ({
              ...item,
              _id: item.id,
              unitCost: Number(item.unitCost),
              subtotal: Number(item.subtotal),
            })),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to receive purchase order');
  }
}
