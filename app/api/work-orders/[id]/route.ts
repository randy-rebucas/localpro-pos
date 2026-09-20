import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireWorkOrderAccess } from '@/lib/work-order-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { isValidWorkOrderStatusTransition, type WorkOrderStatus } from '@/lib/work-order-helpers';
import { logger } from '@/lib/logger';

const includeRelations = {
  assignedTo: { select: { id: true, name: true, email: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  items: true,
} as const;

/**
 * GET - Get a single work order by ID
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
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const workOrder = await prisma.workOrder.findFirst({
      where: { id, tenantId },
      include: includeRelations,
    });

    if (!workOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: workOrder });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get work order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchWorkOrder', 'Failed to fetch work order') },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update a work order: status transitions, technician assignment, notes.
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
    const existing = await prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { assignedToId, status, notes, cancellationReason, scheduledAt, title, description } = body;

    if (status !== undefined && !isValidWorkOrderStatusTransition(existing.status as WorkOrderStatus, status)) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.invalidWorkOrderStatusTransition',
            'Cannot change work order status from {from} to {to}'
          )
            .replace('{from}', existing.status)
            .replace('{to}', status),
        },
        { status: 400 }
      );
    }

    if (assignedToId !== undefined && assignedToId !== null) {
      const technician = await prisma.user.findFirst({ where: { id: assignedToId, tenantId, isActive: true } });
      if (!technician) {
        return NextResponse.json(
          { success: false, error: t('validation.technicianNotFound', 'Technician not found or inactive') },
          { status: 404 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (assignedToId !== undefined) {
      updateData.assignedToId = assignedToId || null;
      // Assigning a technician (going from unassigned to assigned) records assignedAt.
      if (assignedToId && !existing.assignedToId) {
        updateData.assignedAt = new Date();
      }
    }
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'assigned' && !existing.assignedAt) updateData.assignedAt = new Date();
      if (status === 'in_progress' && !existing.startedAt) updateData.startedAt = new Date();
      if (status === 'completed') updateData.completedAt = new Date();
    }
    if (notes !== undefined) updateData.notes = notes;
    if (cancellationReason !== undefined) updateData.cancellationReason = cancellationReason;
    if (scheduledAt !== undefined) updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    await prisma.workOrder.update({ where: { id }, data: updateData });

    const updated = await prisma.workOrder.findUnique({
      where: { id },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'work_order',
      entityId: id,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update work order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateWorkOrder', 'Failed to update work order') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Soft-delete (cancel) a work order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const workOrder = await prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!workOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
        { status: 404 }
      );
    }

    await prisma.workOrder.update({
      where: { id },
      data: { isActive: false, status: 'cancelled' },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'work_order',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.workOrderDeleted', 'Work order cancelled successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete work order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteWorkOrder', 'Failed to delete work order') },
      { status: 500 }
    );
  }
}
