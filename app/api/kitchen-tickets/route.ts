import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
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
 * GET - Get all active kitchen tickets for a tenant
 * Query params:
 * - branchId: filter by branch (optional)
 * - station: filter items by station (optional)
 */
export async function GET(request: NextRequest) {
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
      !(await hasTenantPermission(user.role, tenantId, 'kitchen_display.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'kitchen_display.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get('branchId');
    const station = searchParams.get('station');

    const where: Record<string, unknown> = { tenantId, isActive: { not: false } };
    if (branchId) where.branchId = branchId;

    const tickets = await prisma.kitchenTicket.findMany({
      where,
      include: station
        ? {
            items: {
              where: { station },
              include: {
                transactionItem: { select: { id: true, name: true, quantity: true, price: true } },
              },
            },
          }
        : includeRelations,
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: tickets });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get kitchen tickets error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchKitchenTickets', 'Failed to fetch kitchen tickets') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new kitchen ticket from an existing transaction.
 * Pulls the transaction's TransactionItems and creates one KitchenTicketItem per item.
 */
export async function POST(request: NextRequest) {
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

    if (!(await hasTenantPermission(user.role, tenantId, 'kitchen_display.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:kitchen-tickets:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireKitchenDisplayAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const { branchId, transactionId, tableId, orderType, notes } = body;

    if (!transactionId) {
      return NextResponse.json(
        { success: false, error: t('validation.transactionIdRequired', 'Transaction ID is required') },
        { status: 400 }
      );
    }

    // Verify the transaction belongs to this tenant, and pull its items.
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
      include: { items: true },
    });
    if (!transaction) {
      return NextResponse.json(
        { success: false, error: t('validation.transactionNotFound', 'Transaction not found') },
        { status: 404 }
      );
    }

    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) {
        return NextResponse.json(
          { success: false, error: t('validation.branchNotFound', 'Branch not found') },
          { status: 404 }
        );
      }
    }

    const items = (transaction as { items?: { id: string }[] }).items ?? [];

    const kitchenTicket = await prisma.kitchenTicket.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        transactionId,
        tableId: tableId || undefined,
        orderType: orderType || undefined,
        notes: notes || undefined,
        items: {
          create: items.map((item) => ({
            id: randomUUID(),
            tenantId,
            transactionItemId: item.id,
            status: 'queued' as const,
          })),
        },
      },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'kitchen_ticket',
      entityId: kitchenTicket.id,
      changes: { transactionId, itemCount: items.length },
    });

    return NextResponse.json({ success: true, data: kitchenTicket }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create kitchen ticket error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateKitchenTicket', 'Failed to create kitchen ticket') },
      { status: 500 }
    );
  }
}
