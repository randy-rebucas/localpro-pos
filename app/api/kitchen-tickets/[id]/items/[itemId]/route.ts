import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireKitchenDisplayAccess } from '@/lib/kitchen-display-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { isValidKitchenItemStatusTransition, type KitchenItemStatus } from '@/lib/kitchen-display-helpers';
import { logger } from '@/lib/logger';

/**
 * PATCH - Transition a kitchen ticket item's status, and/or reassign its station.
 */
export async function PATCH(
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

    if (!(await hasTenantPermission(user.role, tenantId, 'kitchen_display.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:kitchen-tickets:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireKitchenDisplayAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id, itemId } = await params;

    const kitchenTicket = await prisma.kitchenTicket.findFirst({ where: { id, tenantId } });
    if (!kitchenTicket) {
      return NextResponse.json(
        { success: false, error: t('validation.kitchenTicketNotFound', 'Kitchen ticket not found') },
        { status: 404 }
      );
    }

    const item = await prisma.kitchenTicketItem.findFirst({ where: { id: itemId, kitchenTicketId: id, tenantId } });
    if (!item) {
      return NextResponse.json(
        { success: false, error: t('validation.kitchenTicketItemNotFound', 'Kitchen ticket item not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status, station } = body;

    if (status !== undefined && !isValidKitchenItemStatusTransition(item.status as KitchenItemStatus, status)) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.invalidKitchenItemStatusTransition',
            'Cannot change kitchen ticket item status from {from} to {to}'
          )
            .replace('{from}', item.status)
            .replace('{to}', status),
        },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'preparing' && !item.startedAt) updateData.startedAt = new Date();
      if (status === 'ready') updateData.readyAt = new Date();
      if (status === 'served') updateData.servedAt = new Date();
    }
    if (station !== undefined) updateData.station = station;

    const updated = await prisma.kitchenTicketItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        transactionItem: { select: { id: true, name: true, quantity: true, price: true } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'kitchen_ticket_item',
      entityId: itemId,
      changes: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update kitchen ticket item error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateKitchenTicketItem', 'Failed to update kitchen ticket item') },
      { status: 500 }
    );
  }
}
