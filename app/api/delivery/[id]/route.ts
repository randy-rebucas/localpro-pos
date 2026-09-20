import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireDeliveryAccess } from '@/lib/delivery-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { isValidDeliveryStatusTransition, type DeliveryStatus } from '@/lib/delivery-helpers';
import { logger } from '@/lib/logger';

const includeRelations = {
  rider: { select: { id: true, name: true, email: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
} as const;

/**
 * GET - Get a single delivery order by ID
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
      !(await hasTenantPermission(user.role, tenantId, 'delivery.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const deliveryOrder = await prisma.deliveryOrder.findFirst({
      where: { id, tenantId },
      include: includeRelations,
    });

    if (!deliveryOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.deliveryNotFound', 'Delivery order not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: deliveryOrder });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get delivery order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchDelivery', 'Failed to fetch delivery order') },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update a delivery order: status transitions, rider assignment, notes.
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

    if (!(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:delivery:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireDeliveryAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.deliveryOrder.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.deliveryNotFound', 'Delivery order not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { riderId, status, notes, failureReason, scheduledAt } = body;

    if (status !== undefined && !isValidDeliveryStatusTransition(existing.status as DeliveryStatus, status)) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.invalidDeliveryStatusTransition',
            'Cannot change delivery status from {from} to {to}'
          )
            .replace('{from}', existing.status)
            .replace('{to}', status),
        },
        { status: 400 }
      );
    }

    if (riderId !== undefined && riderId !== null) {
      const rider = await prisma.user.findFirst({ where: { id: riderId, tenantId, role: 'rider', isActive: true } });
      if (!rider) {
        return NextResponse.json(
          { success: false, error: t('validation.riderNotFound', 'Rider not found or inactive') },
          { status: 404 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (riderId !== undefined) {
      updateData.riderId = riderId || null;
      // Assigning a rider (going from unassigned to assigned) records assignedAt.
      if (riderId && !existing.riderId) {
        updateData.assignedAt = new Date();
      }
    }
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'assigned' && !existing.assignedAt) updateData.assignedAt = new Date();
      if (status === 'picked_up') updateData.pickedUpAt = new Date();
      if (status === 'in_transit' && !existing.pickedUpAt) updateData.pickedUpAt = new Date();
      if (status === 'delivered') updateData.deliveredAt = new Date();
    }
    if (notes !== undefined) updateData.notes = notes;
    if (failureReason !== undefined) updateData.failureReason = failureReason;
    if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    await prisma.deliveryOrder.update({ where: { id }, data: updateData });

    const updated = await prisma.deliveryOrder.findUnique({
      where: { id },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'delivery_order',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update delivery order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateDelivery', 'Failed to update delivery order') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Soft-delete (cancel) a delivery order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const deliveryOrder = await prisma.deliveryOrder.findFirst({ where: { id, tenantId } });
    if (!deliveryOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.deliveryNotFound', 'Delivery order not found') },
        { status: 404 }
      );
    }

    await prisma.deliveryOrder.update({
      where: { id },
      data: { isActive: false, status: 'cancelled' },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'delivery_order',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.deliveryDeleted', 'Delivery order cancelled successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete delivery order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteDelivery', 'Failed to delete delivery order') },
      { status: 500 }
    );
  }
}
