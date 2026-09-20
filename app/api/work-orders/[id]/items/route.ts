import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireWorkOrderAccess } from '@/lib/work-order-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * POST - Add a line item (part/labor) to a work order
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:work-orders:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireWorkOrderAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id } = await params;
    const workOrder = await prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!workOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { productId, name, itemType, price, quantity } = body;

    if (!name || !itemType || price === undefined || quantity === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.workOrderItemFieldsRequired', 'Name, item type, price, and quantity are required'),
        },
        { status: 400 }
      );
    }

    if (productId) {
      const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
      if (!product) {
        return NextResponse.json(
          { success: false, error: t('validation.productNotFound', 'Product not found') },
          { status: 404 }
        );
      }
    }

    const numPrice = Number(price);
    const numQuantity = Number(quantity);
    const subtotal = numPrice * numQuantity;

    const item = await prisma.workOrderItem.create({
      data: {
        id: randomUUID(),
        workOrderId: id,
        productId: productId || undefined,
        name,
        itemType,
        price: numPrice,
        quantity: numQuantity,
        subtotal,
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'work_order_item',
      entityId: item.id,
      changes: { workOrderId: id, name, itemType, price: numPrice, quantity: numQuantity },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create work order item error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateWorkOrderItem', 'Failed to add work order item') },
      { status: 500 }
    );
  }
}
