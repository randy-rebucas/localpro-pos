import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireKitchenDisplayAccess } from '@/lib/kitchen-display-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

const includeRelations = {
  items: {
    include: {
      transactionItem: { select: { id: true, name: true, quantity: true, price: true } },
    },
  },
} as const;

/**
 * GET - Get a single kitchen ticket by ID, with its items
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
      !(await hasTenantPermission(user.role, tenantId, 'kitchen_display.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'kitchen_display.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { id } = await params;
    const kitchenTicket = await prisma.kitchenTicket.findFirst({
      where: { id, tenantId },
      include: includeRelations,
    });

    if (!kitchenTicket) {
      return NextResponse.json(
        { success: false, error: t('validation.kitchenTicketNotFound', 'Kitchen ticket not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: kitchenTicket });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get kitchen ticket error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchKitchenTicket', 'Failed to fetch kitchen ticket') },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Soft-delete a kitchen ticket: isActive false, all items cancelled.
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

    if (!(await hasTenantPermission(user.role, tenantId, 'kitchen_display.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    try {
      await requireKitchenDisplayAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const { id } = await params;
    const kitchenTicket = await prisma.kitchenTicket.findFirst({ where: { id, tenantId } });
    if (!kitchenTicket) {
      return NextResponse.json(
        { success: false, error: t('validation.kitchenTicketNotFound', 'Kitchen ticket not found') },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.kitchenTicket.update({ where: { id }, data: { isActive: false } }),
      prisma.kitchenTicketItem.updateMany({
        where: { kitchenTicketId: id },
        data: { status: 'cancelled' },
      }),
    ]);

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.DELETE,
      entityType: 'kitchen_ticket',
      entityId: id,
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: t('validation.kitchenTicketDeleted', 'Kitchen ticket cancelled successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Delete kitchen ticket error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToDeleteKitchenTicket', 'Failed to delete kitchen ticket') },
      { status: 500 }
    );
  }
}
