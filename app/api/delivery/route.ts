import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireDeliveryAccess } from '@/lib/delivery-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Get all delivery orders for a tenant
 * Query params:
 * - status: delivery status (optional)
 * - riderId: filter by assigned rider (optional)
 * - branchId: filter by branch (optional)
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
      !(await hasTenantPermission(user.role, tenantId, 'delivery.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const riderId = searchParams.get('riderId');
    const branchId = searchParams.get('branchId');

    const where: Record<string, unknown> = { tenantId, isActive: { not: false } };
    if (status) where.status = status;
    if (riderId) where.riderId = riderId;
    if (branchId) where.branchId = branchId;

    const deliveryOrders = await prisma.deliveryOrder.findMany({
      where,
      include: {
        rider: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: deliveryOrders });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get delivery orders error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchDeliveries', 'Failed to fetch delivery orders') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new delivery order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:delivery:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireDeliveryAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const {
      branchId,
      transactionId,
      customerId,
      addressStreet,
      addressCity,
      addressState,
      addressZipCode,
      addressCountry,
      addressLatitude,
      addressLongitude,
      riderId,
      type,
      scheduledAt,
      notes,
    } = body;

    if (!addressStreet || !addressCity || !addressCountry || !type) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.deliveryFieldsRequired',
            'Address street, city, country, and delivery type are required'
          ),
        },
        { status: 400 }
      );
    }

    if (type !== 'pickup' && type !== 'delivery') {
      return NextResponse.json(
        { success: false, error: t('validation.invalidDeliveryType', 'Invalid delivery type') },
        { status: 400 }
      );
    }

    // Verify branch/transaction/customer belong to this tenant when provided
    if (branchId) {
      const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } });
      if (!branch) {
        return NextResponse.json(
          { success: false, error: t('validation.branchNotFound', 'Branch not found') },
          { status: 404 }
        );
      }
    }
    if (transactionId) {
      const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, tenantId } });
      if (!transaction) {
        return NextResponse.json(
          { success: false, error: t('validation.transactionNotFound', 'Transaction not found') },
          { status: 404 }
        );
      }
    }
    if (customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
      if (!customer) {
        return NextResponse.json(
          { success: false, error: t('validation.customerNotFound', 'Customer not found') },
          { status: 404 }
        );
      }
    }
    if (riderId) {
      const rider = await prisma.user.findFirst({ where: { id: riderId, tenantId, role: 'rider', isActive: true } });
      if (!rider) {
        return NextResponse.json(
          { success: false, error: t('validation.riderNotFound', 'Rider not found or inactive') },
          { status: 404 }
        );
      }
    }

    const deliveryOrder = await prisma.deliveryOrder.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        transactionId: transactionId || undefined,
        customerId: customerId || undefined,
        addressStreet,
        addressCity,
        addressState,
        addressZipCode,
        addressCountry,
        addressLatitude: addressLatitude ?? undefined,
        addressLongitude: addressLongitude ?? undefined,
        riderId: riderId || undefined,
        type,
        status: riderId ? 'assigned' : 'pending',
        assignedAt: riderId ? new Date() : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        notes,
      },
      include: {
        rider: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'delivery_order',
      entityId: deliveryOrder.id,
      changes: { type, addressStreet, addressCity, riderId },
    });

    return NextResponse.json({ success: true, data: deliveryOrder }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create delivery order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateDelivery', 'Failed to create delivery order') },
      { status: 500 }
    );
  }
}
