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
 * POST - Mark a stock transfer's items as sent from the source branch.
 * Decrements ProductBranchStock at fromBranch (never below zero — the source
 * branch's on-hand count is the hard ceiling) and logs a StockMovement.
 * Moves the transfer to in_transit.
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
    if (stockTransfer.status !== 'pending') {
      return NextResponse.json({ success: false, error: `Cannot send a transfer that is already ${stockTransfer.status}` }, { status: 400 });
    }

    const sends: { itemId: string; productId: string; quantity: number; previousStock: number; newStock: number }[] = [];

    for (const item of stockTransfer.items) {
      const branchStock = await prisma.productBranchStock.findUnique({
        where: { productId_branchId: { productId: item.productId, branchId: stockTransfer.fromBranchId } },
      });
      const available = branchStock?.stock ?? 0;
      const quantity = Math.min(item.quantityRequested, available);
      if (quantity <= 0) continue;

      sends.push({
        itemId: item.id,
        productId: item.productId,
        quantity,
        previousStock: available,
        newStock: available - quantity,
      });
    }

    if (sends.length === 0) {
      return NextResponse.json({ success: false, error: 'No stock available at the source branch to send' }, { status: 400 });
    }

    await dbTransaction(async (tx) => {
      for (const send of sends) {
        await tx.stockTransferItem.update({ where: { id: send.itemId }, data: { quantitySent: send.quantity } });
        await tx.productBranchStock.update({
          where: { productId_branchId: { productId: send.productId, branchId: stockTransfer.fromBranchId } },
          data: { stock: send.newStock },
        });
        await tx.stockMovement.create({
          data: {
            id: randomUUID(),
            productId: send.productId,
            tenantId,
            branchId: stockTransfer.fromBranchId,
            type: 'transfer',
            quantity: -send.quantity,
            previousStock: send.previousStock,
            newStock: send.newStock,
            reason: `Transfer ${stockTransfer.transferNumber} sent`,
            userId: user.userId,
          },
        });
      }

      await tx.stockTransfer.update({
        where: { id: stockTransfer.id },
        data: { status: 'in_transit', sentAt: new Date() },
      });
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'stock_transfer',
      entityId: id,
      changes: { sent: sends.map((s) => ({ productId: s.productId, quantity: s.quantity })) },
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
    return handleApiError(error, 'Failed to send stock transfer');
  }
}
