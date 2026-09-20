import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireWorkOrderAccess } from '@/lib/work-order-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * DELETE - Remove a line item from a work order
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
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

    try {
      await requireWorkOrderAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id, itemId } = await params;

    const workOrder = await prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!workOrder) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
        { status: 404 }
      );
    }

    const item = await prisma.workOrderItem.findFirst({ where: { id: itemId, workOrderId: id } });
    if (!item) {
      return NextResponse.json(
        { success: false, error: t('validation.workOrderItemNotFound', 'Work order item not found') },
        { status: 404 }
      );
    }

    await prisma.workOrderItem.delete({ where: { id: itemId } });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'work_order_item',
      entityId: itemId,
      changes: { workOrderId: id },
    });

    return NextResponse.json({ success: true, message: t('validation.workOrderItemDeleted', 'Work order item removed successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete work order item error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteWorkOrderItem', 'Failed to remove work order item') },
      { status: 500 }
    );
  }
}
