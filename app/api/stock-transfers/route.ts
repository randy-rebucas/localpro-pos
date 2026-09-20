import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma, { dbTransaction } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toStockTransferJSON(st: { id: string; [key: string]: unknown }) {
  return {
    ...st,
    _id: st.id,
  };
}

async function getNextStockTransferNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `ST-${dateStr}`;

  const counter = await dbTransaction(async (tx) => {
    return tx.counter.upsert({
      where: { tenantId_key: { tenantId, key: prefix } },
      update: { value: { increment: 1 } },
      create: { id: randomUUID(), tenantId, key: prefix, value: 1 },
    });
  });

  return `${prefix}-${counter.value.toString().padStart(4, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireTenantAccess(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:stock-transfers:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const branchId = searchParams.get('branchId');

    const where: Prisma.StockTransferWhereInput = { tenantId };
    if (status) where.status = status as Prisma.EnumStockTransferStatusFilter['equals'];
    if (branchId) where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];

    const stockTransfers = await prisma.stockTransfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: stockTransfers.map(toStockTransferJSON) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch stock transfers');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'stock_transfers.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:stock-transfers:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { fromBranchId, toBranchId, notes, items } = body;

    if (!fromBranchId || !toBranchId) {
      return NextResponse.json({ success: false, error: 'From and to branch are required' }, { status: 400 });
    }
    if (fromBranchId === toBranchId) {
      return NextResponse.json({ success: false, error: 'Source and destination branch must be different' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }

    const [fromBranch, toBranch] = await Promise.all([
      prisma.branch.findFirst({ where: { id: fromBranchId, tenantId } }),
      prisma.branch.findFirst({ where: { id: toBranchId, tenantId } }),
    ]);
    if (!fromBranch || !toBranch) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }

    const productIds = items.map((item: { productId: string }) => item.productId).filter(Boolean);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId } });
    const foundIds = new Set(products.map((p) => p.id));
    for (const pid of productIds) {
      if (!foundIds.has(pid)) {
        return NextResponse.json({ success: false, error: 'One or more products not found' }, { status: 404 });
      }
    }

    const itemsData = items.map((item: { productId: string; quantityRequested: number }) => ({
      id: randomUUID(),
      productId: item.productId,
      quantityRequested: Math.max(1, Math.trunc(Number(item.quantityRequested) || 0)),
    }));

    const transferNumber = await getNextStockTransferNumber(tenantId);

    const stockTransfer = await prisma.stockTransfer.create({
      data: {
        id: randomUUID(),
        tenantId,
        fromBranchId,
        toBranchId,
        transferNumber,
        notes: notes || undefined,
        createdById: user.userId,
        items: { create: itemsData },
      },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'stock_transfer',
      entityId: stockTransfer.id,
      changes: { transferNumber, fromBranchId, toBranchId },
    });

    return NextResponse.json({ success: true, data: toStockTransferJSON(stockTransfer) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create stock transfer');
  }
}
