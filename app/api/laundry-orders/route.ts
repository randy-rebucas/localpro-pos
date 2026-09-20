import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireLaundryOrderAccess } from '@/lib/laundry-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

const includeRelations = {
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  items: true,
} as const;

/**
 * GET - Get all laundry orders for a tenant
 * Query params:
 * - status: laundry order status (optional)
 * - branchId: filter by branch (optional)
 * - customerId: filter by customer (optional)
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
      !(await hasTenantPermission(user.role, tenantId, 'laundry_orders.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'laundry_orders.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const branchId = searchParams.get('branchId');
    const customerId = searchParams.get('customerId');

    const where: Record<string, unknown> = { tenantId, isActive: { not: false } };
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;

    const laundryOrders = await prisma.laundryOrder.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: laundryOrders });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get laundry orders error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchLaundryOrders', 'Failed to fetch laundry orders') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new laundry order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'laundry_orders.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:laundry-orders:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireLaundryOrderAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const {
      branchId,
      transactionId,
      customerId,
      pricingMethod,
      totalWeightKg,
      notes,
      items,
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.laundryOrderItemsRequired', 'At least one item is required'),
        },
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

    const productIds = items.map((item: any) => item.productId).filter(Boolean); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId } });
      const foundIds = new Set(products.map((p) => p.id));
      for (const pid of productIds) {
        if (!foundIds.has(pid)) {
          return NextResponse.json(
            { success: false, error: t('validation.productNotFound', 'Product not found') },
            { status: 404 }
          );
        }
      }
    }

    const itemsData = items.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const unitPrice = Number(item.unitPrice) || 0;
      const quantity = Number(item.quantity) || 1;
      return {
        id: randomUUID(),
        productId: item.productId || undefined,
        name: item.name,
        tagNumber: item.tagNumber || undefined,
        qrCode: item.qrCode || undefined,
        weightKg: item.weightKg !== undefined && item.weightKg !== null ? Number(item.weightKg) : undefined,
        quantity,
        unitPrice,
        subtotal: unitPrice * quantity,
        condition: item.condition || undefined,
        notes: item.notes || undefined,
      };
    });

    const totalAmount = itemsData.reduce((sum, item) => sum + item.subtotal, 0);

    const laundryOrder = await prisma.laundryOrder.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        transactionId: transactionId || undefined,
        customerId: customerId || undefined,
        pricingMethod: pricingMethod === 'weight' ? 'weight' : 'item',
        totalWeightKg: totalWeightKg !== undefined && totalWeightKg !== null ? Number(totalWeightKg) : undefined,
        totalAmount,
        notes,
        items: { create: itemsData },
      },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'laundry_order',
      entityId: laundryOrder.id,
      changes: { customerId, totalAmount },
    });

    return NextResponse.json({ success: true, data: laundryOrder }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create laundry order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateLaundryOrder', 'Failed to create laundry order') },
      { status: 500 }
    );
  }
}
