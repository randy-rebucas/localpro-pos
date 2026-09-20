import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { isValidStockTransferStatusTransition, type StockTransferStatus } from '@/lib/stock-transfer-helpers';

function toStockTransferJSON(st: { id: string; [key: string]: unknown }) {
  return { ...st, _id: st.id };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const stockTransfer = await prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    if (!stockTransfer) {
      return NextResponse.json({ success: false, error: 'Stock transfer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toStockTransferJSON(stockTransfer) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stock transfer');
  }
}

/**
 * PUT - Update notes, or cancel a transfer.
 * Sending/receiving stock happens through the dedicated /send and /receive
 * endpoints — those are the only paths that move inventory.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const stockTransfer = await prisma.stockTransfer.findFirst({ where: { id, tenantId } });
    if (!stockTransfer) {
      return NextResponse.json({ success: false, error: 'Stock transfer not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Prisma.StockTransferUpdateInput = {};

    if (body.status !== undefined) {
      const from = stockTransfer.status as StockTransferStatus;
      const to = body.status as StockTransferStatus;
      if (to === 'in_transit' || to === 'received' || to === 'partially_received') {
        return NextResponse.json(
          { success: false, error: 'Use the send/receive endpoints to move stock' },
          { status: 400 }
        );
      }
      if (!isValidStockTransferStatusTransition(from, to)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition stock transfer from "${from}" to "${to}"` },
          { status: 400 }
        );
      }
      updates.status = to;
    }
    if (body.notes !== undefined) updates.notes = body.notes;

    const updated = await prisma.stockTransfer.update({
      where: { id: stockTransfer.id },
      data: updates,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'stock_transfer',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: toStockTransferJSON(updated) });
  } catch (error) {
    return handleApiError(error, 'Failed to update stock transfer');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const stockTransfer = await prisma.stockTransfer.findFirst({ where: { id, tenantId } });
    if (!stockTransfer) {
      return NextResponse.json({ success: false, error: 'Stock transfer not found' }, { status: 404 });
    }

    if (stockTransfer.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a stock transfer once it is in transit. Cancel it instead.' },
        { status: 400 }
      );
    }

    await prisma.stockTransfer.delete({ where: { id: stockTransfer.id } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'stock_transfer',
      entityId: id,
      changes: { transferNumber: stockTransfer.transferNumber },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete stock transfer');
  }
}
