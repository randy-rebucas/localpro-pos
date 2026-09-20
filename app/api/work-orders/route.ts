import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireWorkOrderAccess } from '@/lib/work-order-access';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Get all work orders for a tenant
 * Query params:
 * - status: work order status (optional)
 * - assignedToId: filter by assigned technician (optional)
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
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedToId = searchParams.get('assignedToId');
    const branchId = searchParams.get('branchId');
    const customerId = searchParams.get('customerId');

    const where: Record<string, unknown> = { tenantId, isActive: { not: false } };
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;
    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: workOrders });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get work orders error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchWorkOrders', 'Failed to fetch work orders') },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new work order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'work_orders.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:work-orders:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    try {
      await requireWorkOrderAccess(tenantId.toString());
    } catch (featureError: unknown) {
      const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const body = await request.json();
    const {
      branchId,
      transactionId,
      customerId,
      title,
      description,
      assignedToId,
      scheduledAt,
      notes,
      items,
    } = body;

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.workOrderFieldsRequired', 'Title is required'),
        },
        { status: 400 }
      );
    }

    // Verify branch/transaction/customer/assignedTo belong to this tenant when provided
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
    if (assignedToId) {
      const technician = await prisma.user.findFirst({ where: { id: assignedToId, tenantId, isActive: true } });
      if (!technician) {
        return NextResponse.json(
          { success: false, error: t('validation.technicianNotFound', 'Technician not found or inactive') },
          { status: 404 }
        );
      }
    }

    let itemsData: {
      id: string;
      productId?: string;
      name: string;
      itemType: string;
      price: number;
      quantity: number;
      subtotal: number;
    }[] = [];

    if (Array.isArray(items) && items.length > 0) {
      // Validate any referenced products belong to this tenant.
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

      itemsData = items.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        return {
          id: randomUUID(),
          productId: item.productId || undefined,
          name: item.name,
          itemType: item.itemType,
          price,
          quantity,
          subtotal: price * quantity,
        };
      });
    }

    const workOrder = await prisma.workOrder.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId: branchId || undefined,
        transactionId: transactionId || undefined,
        customerId: customerId || undefined,
        title,
        description: description || undefined,
        assignedToId: assignedToId || undefined,
        status: assignedToId ? 'assigned' : 'pending',
        assignedAt: assignedToId ? new Date() : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        notes,
        items: itemsData.length > 0 ? { create: itemsData } : undefined,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: true,
      },
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'work_order',
      entityId: workOrder.id,
      changes: { title, assignedToId },
    });

    return NextResponse.json({ success: true, data: workOrder }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create work order error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateWorkOrder', 'Failed to create work order') },
      { status: 500 }
    );
  }
}
