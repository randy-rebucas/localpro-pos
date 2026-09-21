import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireWorkOrderAccess } from '@/lib/work-order-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - List time entries for a work order
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let user;
    const t = await getValidationTranslatorFromRequest(request);
    try {
      user = await requireAuth(request);
    } catch {
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
      !(await hasTenantPermission(user.role, tenantId, 'work_order_time.manage')) &&
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))
    ) {
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

    const timeEntries = await prisma.workOrderTimeEntry.findMany({
      where: { tenantId, workOrderId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: timeEntries });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get work order time entries error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchTimeEntries', 'Failed to fetch time entries') },
      { status: 500 }
    );
  }
}

/**
 * POST - Start a new time entry (clock in) against a work order.
 * A user may only have one open entry (endedAt null) per work order at a time.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    const user = await getCurrentUser(request);
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

    if (!(await hasTenantPermission(user.role, tenantId, 'work_order_time.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:work-order-time:${tenantId}:${ip}`, 30, 60_000);
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

    const body = await request.json().catch(() => ({}));
    const userId = body.userId || user.userId;

    if (userId !== user.userId) {
      const technician = await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true } });
      if (!technician) {
        return NextResponse.json(
          { success: false, error: t('validation.technicianNotFound', 'Technician not found or inactive') },
          { status: 404 }
        );
      }
    }

    const openEntry = await prisma.workOrderTimeEntry.findFirst({
      where: { tenantId, workOrderId: id, userId, endedAt: null },
    });
    if (openEntry) {
      return NextResponse.json(
        { success: false, error: t('validation.timeEntryAlreadyOpen', 'This technician already has an open time entry on this work order') },
        { status: 400 }
      );
    }

    let timeEntry;
    try {
      timeEntry = await dbTransaction(async (tx) => {
        const created = await tx.workOrderTimeEntry.create({
          data: {
            id: randomUUID(),
            tenantId,
            workOrderId: id,
            userId,
            startedAt: new Date(),
            notes: body.notes || undefined,
          },
          include: { user: { select: { id: true, name: true, email: true } } },
        });

        if (workOrder.status === 'assigned' || workOrder.status === 'pending') {
          await tx.workOrder.update({
            where: { id },
            data: { status: 'in_progress', startedAt: workOrder.startedAt || new Date() },
          });
        }

        return created;
      });
    } catch (txError: unknown) {
      // Unique-constraint race: another request opened a time entry for this
      // technician/work-order between our findFirst check and this create.
      if (typeof txError === 'object' && txError !== null && 'code' in txError && txError.code === 'P2002') {
        return NextResponse.json(
          { success: false, error: t('validation.timeEntryAlreadyOpen', 'This technician already has an open time entry on this work order') },
          { status: 400 }
        );
      }
      throw txError;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'work_order_time_entry',
      entityId: timeEntry.id,
      changes: { workOrderId: id, userId },
    });

    return NextResponse.json({ success: true, data: timeEntry }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Start work order time entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToStartTimeEntry', 'Failed to start time entry') },
      { status: 500 }
    );
  }
}
