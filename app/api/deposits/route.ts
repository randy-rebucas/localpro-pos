import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

const includeRelations = {
  booking: { select: { id: true, serviceName: true, customerName: true, startTime: true } },
  workOrder: { select: { id: true, title: true } },
  customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
  recordedBy: { select: { id: true, name: true } },
} as const;

/**
 * GET - Get all deposits for a tenant
 * Query params:
 * - status: deposit status (optional)
 * - bookingId: filter by booking (optional)
 * - workOrderId: filter by work order (optional)
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
      !(await hasTenantPermission(user.role, tenantId, 'deposits.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'deposits.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const bookingId = searchParams.get('bookingId');
    const workOrderId = searchParams.get('workOrderId');
    const customerId = searchParams.get('customerId');

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (bookingId) where.bookingId = bookingId;
    if (workOrderId) where.workOrderId = workOrderId;
    if (customerId) where.customerId = customerId;

    const deposits = await prisma.deposit.findMany({
      where,
      include: includeRelations,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: deposits });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get deposits error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchDeposits', 'Failed to fetch deposits') },
      { status: 500 }
    );
  }
}

/**
 * POST - Record a new deposit against a booking or work order
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

    if (!(await hasTenantPermission(user.role, tenantId, 'deposits.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:deposits:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const {
      bookingId,
      workOrderId,
      customerId,
      amount,
      method,
      notes,
      idempotencyKey,
      markPaid,
    } = body;

    if (!bookingId && !workOrderId) {
      return NextResponse.json(
        {
          success: false,
          error: t('validation.depositTargetRequired', 'A deposit must be linked to a booking or work order'),
        },
        { status: 400 }
      );
    }

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json(
        { success: false, error: t('validation.depositAmountRequired', 'A positive deposit amount is required') },
        { status: 400 }
      );
    }

    if (!method) {
      return NextResponse.json(
        { success: false, error: t('validation.depositMethodRequired', 'Payment method is required') },
        { status: 400 }
      );
    }

    // Verify booking/work order/customer belong to this tenant when provided.
    if (bookingId) {
      const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
      if (!booking) {
        return NextResponse.json(
          { success: false, error: t('validation.bookingNotFound', 'Booking not found') },
          { status: 404 }
        );
      }
    }
    if (workOrderId) {
      const workOrder = await prisma.workOrder.findFirst({ where: { id: workOrderId, tenantId } });
      if (!workOrder) {
        return NextResponse.json(
          { success: false, error: t('validation.workOrderNotFound', 'Work order not found') },
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

    if (idempotencyKey) {
      const existing = await prisma.deposit.findFirst({ where: { tenantId, idempotencyKey } });
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
      }
    }

    const deposit = await prisma.deposit.create({
      data: {
        id: randomUUID(),
        tenantId,
        bookingId: bookingId || undefined,
        workOrderId: workOrderId || undefined,
        customerId: customerId || undefined,
        amount: numericAmount,
        method,
        status: markPaid ? 'paid' : 'pending',
        paidAt: markPaid ? new Date() : undefined,
        notes: notes || undefined,
        idempotencyKey: idempotencyKey || undefined,
        recordedById: user.userId,
      },
      include: includeRelations,
    });

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.CREATE,
      entityType: 'deposit',
      entityId: deposit.id,
      changes: { bookingId, workOrderId, amount: numericAmount, method },
    });

    return NextResponse.json({ success: true, data: deposit }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Create deposit error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToCreateDeposit', 'Failed to create deposit') },
      { status: 500 }
    );
  }
}
