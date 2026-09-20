import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireLaundryOrderAccess } from '@/lib/laundry-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import {
  isValidLaundryStatusTransition,
  LAUNDRY_STATUS_TIMESTAMP_FIELD,
  type LaundryOrderStatus,
} from '@/lib/laundry-helpers';
import { notifyOrderStatusChange } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const includeRelations = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  items: true,
} as const;

/**
 * GET - Get a single laundry order by ID
 */
export async function GET(
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

    if (
      !(await hasTenantPermission(user.role, tenantId, 'laundry_orders.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'laundry_orders.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const laundryOrder = await prisma.laundryOrder.findFirst({
      where: { id, tenantId },
      include: includeRelations,
    });

    if (!laundryOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.laundryOrderNotFound', 'Laundry order not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: laundryOrder });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get laundry order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchLaundryOrder', 'Failed to fetch laundry order') },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update a laundry order: status transitions, notes.
 */
export async function PATCH(
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

    if (!(await hasTenantPermission(user.role, tenantId, 'laundry_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:laundry-orders:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireLaundryOrderAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.laundryOrder.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.laundryOrderNotFound', 'Laundry order not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status, notes, totalWeightKg } = body;

    if (
      status !== undefined &&
      !isValidLaundryStatusTransition(existing.status as LaundryOrderStatus, status)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.invalidLaundryOrderStatusTransition',
            'Cannot change laundry order status from {from} to {to}'
          )
            .replace('{from}', existing.status)
            .replace('{to}', status),
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status;
      const timestampField = LAUNDRY_STATUS_TIMESTAMP_FIELD[status as LaundryOrderStatus];
      if (timestampField) updateData[timestampField] = new Date();
    }
    if (notes !== undefined) updateData.notes = notes;
    if (totalWeightKg !== undefined) {
      updateData.totalWeightKg = totalWeightKg !== null ? Number(totalWeightKg) : null;
    }

    await prisma.laundryOrder.update({ where: { id }, data: updateData });

    const updated = await prisma.laundryOrder.findUnique({
      where: { id },
      include: includeRelations,
    });

    if (status === 'ready' || status === 'out_for_delivery') {
      await notifyOrderStatusChange(tenantId, existing.customerId, {
        orderType: 'laundry',
        orderId: id,
        status,
      }).catch(() => {});
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'laundry_order',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update laundry order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateLaundryOrder', 'Failed to update laundry order') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Soft-delete (cancel) a laundry order
 */
export async function DELETE(
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

    if (!(await hasTenantPermission(user.role, tenantId, 'laundry_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const laundryOrder = await prisma.laundryOrder.findFirst({ where: { id, tenantId } });
    if (!laundryOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.laundryOrderNotFound', 'Laundry order not found') },
        { status: 404 }
      );
    }

    await prisma.laundryOrder.update({
      where: { id },
      data: { isActive: false, status: 'cancelled', cancelledAt: new Date() },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'laundry_order',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.laundryOrderDeleted', 'Laundry order cancelled successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete laundry order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteLaundryOrder', 'Failed to delete laundry order') },
      { status: 500 }
    );
  }
}
