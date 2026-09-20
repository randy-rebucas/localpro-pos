import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { isValidPurchaseOrderStatusTransition, type PurchaseOrderStatus } from '@/lib/purchase-order-helpers';

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toPurchaseOrderJSON(purchaseOrder) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch purchase order');
  }
}

/**
 * PUT - Update purchase order status/notes/expectedDate.
 * Line items and totals are immutable once created — cancel and recreate for changes to quantities/costs.
 * Use POST /api/purchase-orders/[id]/receive to receive stock (that's the only path that moves inventory).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const purchaseOrder = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Prisma.PurchaseOrderUpdateInput = {};

    if (body.status !== undefined) {
      const from = purchaseOrder.status as PurchaseOrderStatus;
      const to = body.status as PurchaseOrderStatus;
      if (to === 'received' || to === 'partially_received') {
        return NextResponse.json(
          { success: false, error: 'Use the receive endpoint to mark items as received' },
          { status: 400 }
        );
      }
      if (!isValidPurchaseOrderStatusTransition(from, to)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition purchase order from "${from}" to "${to}"` },
          { status: 400 }
        );
      }
      updates.status = to;
    }
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.expectedDate !== undefined) updates.expectedDate = body.expectedDate ? new Date(body.expectedDate) : null;

    const updated = await prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: updates,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'purchase_order',
      entityId: id,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: toPurchaseOrderJSON(updated) });
  } catch (error) {
    return handleApiError(error, 'Failed to update purchase order');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const purchaseOrder = await prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!purchaseOrder) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    if (purchaseOrder.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: `Cannot delete a purchase order once it has been ordered. Cancel it instead.` },
        { status: 400 }
      );
    }

    await prisma.purchaseOrder.delete({ where: { id: purchaseOrder.id } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'purchase_order',
      entityId: id,
      changes: { orderNumber: purchaseOrder.orderNumber },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete purchase order');
  }
}
