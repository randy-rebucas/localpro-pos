import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { dbTransaction } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toPurchaseOrderJSON(po: {
  id: string;
  totalAmount: Prisma.Decimal;
  items?: { id: string; unitCost: Prisma.Decimal; subtotal: Prisma.Decimal; [key: string]: unknown }[];
  [key: string]: unknown;
}) {
  return {
    ...po,
    _id: po.id,
    totalAmount: Number(po.totalAmount),
    items: po.items?.map((item) => ({
      ...item,
      _id: item.id,
      unitCost: Number(item.unitCost),
      subtotal: Number(item.subtotal),
    })),
  };
}

async function getNextPurchaseOrderNumber(tenantId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PO-${dateStr}`;

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
    const { allowed } = checkRateLimit(`read:purchase-orders:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplierId');
    const branchId = searchParams.get('branchId');

    const where: Prisma.PurchaseOrderWhereInput = { tenantId };
    if (status) where.status = status as Prisma.EnumPurchaseOrderStatusFilter['equals'];
    if (supplierId) where.supplierId = supplierId;
    if (branchId) where.branchId = branchId;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: purchaseOrders.map(toPurchaseOrderJSON) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch purchase orders');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'purchase_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:purchase-orders:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const { supplierId, branchId, notes, expectedDate, items } = body;

    if (!supplierId) {
      return NextResponse.json({ success: false, error: 'Supplier is required' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one item is required' }, { status: 400 });
    }

    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) {
        return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
      }
    }

    const productIds = items.map((item: { productId: string }) => item.productId).filter(Boolean);
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId } });
    const foundIds = new Set(products.map((p) => p.id));
    for (const pid of productIds) {
      if (!foundIds.has(pid)) {
        return NextResponse.json({ success: false, error: 'One or more products not found' }, { status: 404 });
      }
    }

    let totalAmount = 0;
    const itemsData = items.map((item: { productId: string; quantityOrdered: number; unitCost: number }) => {
      const quantityOrdered = Math.max(1, Math.trunc(Number(item.quantityOrdered) || 0));
      const unitCost = Number(item.unitCost) || 0;
      const subtotal = quantityOrdered * unitCost;
      totalAmount += subtotal;
      return {
        id: randomUUID(),
        productId: item.productId,
        quantityOrdered,
        unitCost,
        subtotal,
      };
    });

    const orderNumber = await getNextPurchaseOrderNumber(tenantId);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        id: randomUUID(),
        tenantId,
        supplierId,
        branchId: branchId || undefined,
        orderNumber,
        notes: notes || undefined,
        expectedDate: expectedDate ? new Date(expectedDate) : undefined,
        createdById: user.userId,
        totalAmount,
        items: { create: itemsData },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'purchase_order',
      entityId: purchaseOrder.id,
      changes: { orderNumber, supplierId, totalAmount },
    });

    return NextResponse.json({ success: true, data: toPurchaseOrderJSON(purchaseOrder) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create purchase order');
  }
}
