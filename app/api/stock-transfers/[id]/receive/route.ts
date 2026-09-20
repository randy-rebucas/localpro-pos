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
 * POST - Receive a stock transfer's sent items into the destination branch.
 * Body: { items: [{ itemId, quantityReceived }] } — quantityReceived is the
 * total received-to-date for that line, capped at what was actually sent.
 * Increments ProductBranchStock at toBranch and rolls the transfer to
 * partially_received or received based on whether every line is fully received.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'stock_transfers.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:stock-transfers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const stockTransfer = await prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!stockTransfer) {
      return NextResponse.json({ success: false, error: 'Stock transfer not found' }, { status: 404 });
    }
    if (stockTransfer.status !== 'in_transit' && stockTransfer.status !== 'partially_received') {
      return NextResponse.json({ success: false, error: `Cannot receive a transfer that is ${stockTransfer.status}` }, { status: 400 });
    }

    const body = await request.json();
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }

    const itemsById = new Map(stockTransfer.items.map((item) => [item.id, item]));
    const receipts: { itemId: string; productId: string; delta: number }[] = [];

    for (const entry of items as { itemId: string; quantityReceived: number }[]) {
      const transferItem = itemsById.get(entry.itemId);
      if (!transferItem) {
        return NextResponse.json({ success: false, error: `Transfer item ${entry.itemId} not found` }, { status: 404 });
      }
      const newQuantityReceived = Math.trunc(Number(entry.quantityReceived));
      if (!Number.isFinite(newQuantityReceived) || newQuantityReceived < 0) {
        return NextResponse.json({ success: false, error: 'quantityReceived must be a non-negative number' }, { status: 400 });
      }
      if (newQuantityReceived > transferItem.quantitySent) {
        return NextResponse.json(
          { success: false, error: `Cannot receive more than the ${transferItem.quantitySent} sent for this line` },
          { status: 400 }
        );
      }
      const delta = newQuantityReceived - transferItem.quantityReceived;
      if (delta === 0) continue;
      receipts.push({ itemId: transferItem.id, productId: transferItem.productId, delta });
    }

    if (receipts.length === 0) {
      return NextResponse.json({ success: false, error: 'No change in received quantities' }, { status: 400 });
    }

    await dbTransaction(async (tx) => {
      for (const receipt of receipts) {
        const existing = await tx.productBranchStock.findUnique({
          where: { productId_branchId: { productId: receipt.productId, branchId: stockTransfer.toBranchId } },
        });
        const previousStock = existing?.stock ?? 0;
        const newStock = previousStock + receipt.delta;

        if (existing) {
          await tx.productBranchStock.update({ where: { id: existing.id }, data: { stock: newStock } });
        } else {
          await tx.productBranchStock.create({
            data: { id: randomUUID(), productId: receipt.productId, branchId: stockTransfer.toBranchId, stock: newStock },
          });
        }

        const item = itemsById.get(receipt.itemId)!;
        await tx.stockTransferItem.update({
          where: { id: receipt.itemId },
          data: { quantityReceived: item.quantityReceived + receipt.delta },
        });

        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            productId: receipt.productId,
            tenantId,
            branchId: stockTransfer.toBranchId,
            type: 'transfer',
            quantity: receipt.delta,
            previousStock,
            newStock,
            reason: `Transfer ${stockTransfer.transferNumber} received`,
            userId: user.userId,
          },
        });
      }

      const allItems = await tx.stockTransferItem.findMany({ where: { stockTransferId: stockTransfer.id } });
      const fullyReceived = allItems.every((item) => item.quantityReceived >= item.quantitySent);
      const anyReceived = allItems.some((item) => item.quantityReceived > 0);

      await tx.stockTransfer.update({
        where: { id: stockTransfer.id },
        data: {
          status: fullyReceived ? 'received' : anyReceived ? 'partially_received' : stockTransfer.status,
          receivedAt: fullyReceived ? new Date() : undefined,
        },
      });
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'stock_transfer',
      entityId: id,
      changes: { received: receipts.map((r) => ({ productId: r.productId, delta: r.delta })) },
    });

    const updated = await prisma.stockTransfer.findFirst({
      where: { id },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    return NextResponse.json({ success: true, data: updated ? { ...updated, _id: updated.id } : null });
  } catch (error) {
    return handleApiError(error, 'Failed to receive stock transfer');
  }
}
