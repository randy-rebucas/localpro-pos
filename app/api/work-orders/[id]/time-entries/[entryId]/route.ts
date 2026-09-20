import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * PATCH - Stop a running time entry (clock out) or edit its notes.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
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

    if (!(await hasTenantPermission(user.role, tenantId, 'work_order_time.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:work-order-time:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const { id, entryId } = await params;
    const existing = await prisma.workOrderTimeEntry.findFirst({ where: { id: entryId, tenantId, workOrderId: id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.timeEntryNotFound', 'Time entry not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { stop, notes } = body;

    const updateData: Record<string, unknown> = {};
    if (stop) {
      if (existing.endedAt) {
        return NextResponse.json(
          { success: false, error: t('validation.timeEntryAlreadyStopped', 'This time entry has already been stopped') },
          { status: 400 }
        );
      }
      const endedAt = new Date();
      updateData.endedAt = endedAt;
      updateData.durationMinutes = Math.max(0, Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 60000));
    }
    if (notes !== undefined) updateData.notes = notes;

    await prisma.workOrderTimeEntry.update({ where: { id: entryId }, data: updateData });

    const updated = await prisma.workOrderTimeEntry.findUnique({
      where: { id: entryId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'work_order_time_entry',
      entityId: entryId,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update work order time entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateTimeEntry', 'Failed to update time entry') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove a time entry (e.g. logged in error).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
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

    if (!(await hasTenantPermission(user.role, tenantId, 'work_order_time.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id, entryId } = await params;
    const existing = await prisma.workOrderTimeEntry.findFirst({ where: { id: entryId, tenantId, workOrderId: id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: t('validation.timeEntryNotFound', 'Time entry not found') },
        { status: 404 }
      );
    }

    await prisma.workOrderTimeEntry.delete({ where: { id: entryId } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'work_order_time_entry',
      entityId: entryId,
      changes: { deleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.timeEntryDeleted', 'Time entry deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete work order time entry error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteTimeEntry', 'Failed to delete time entry') },
      { status: 500 }
    );
  }
}
