import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getTenantSettingsById } from '@/lib/tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const VALID_METHODS = ['cash', 'card', 'digital', 'check', 'other'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;

    let tenantId: string;
    try {
      const access = await requireTenantAccess(request);
      tenantId = access.tenantId;
      if (!(await hasTenantPermission(access.user.role, tenantId, 'customers.balance_payments'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : '';
      if (msg.includes('Unauthorized')) {
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
      if (msg.includes('Forbidden')) {
        return NextResponse.json({ success: false, error: msg }, { status: 403 });
      }
      throw authError;
    }

    const t = await getValidationTranslatorFromRequest(request);
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const payments = await prisma.customerBalancePayment.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: payments.map((p) => ({ ...p, _id: p.id, amount: Number(p.amount) })),
    });
  } catch (error: unknown) {
    logger.error('balance-payments GET:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch balance payments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let idempotencyKeyForConflictCheck: string | undefined;
  let tenantIdForConflictCheck: string | undefined;
  try {
    const { id: customerId } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    let tenantId: string;
    let userId: string;
    try {
      const access = await requireTenantAccess(request);
      tenantId = access.tenantId;
      userId = access.user.userId;
      if (!(await hasTenantPermission(access.user.role, tenantId, 'customers.balance_payments'))) {
        throw new Error('Forbidden: Insufficient permissions');
      }
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : '';
      if (msg.includes('Unauthorized')) {
        return NextResponse.json({ success: false, error: msg }, { status: 401 });
      }
      if (msg.includes('Forbidden')) {
        return NextResponse.json({ success: false, error: msg }, { status: 403 });
      }
      throw authError;
    }

    const tenantSettings = await getTenantSettingsById(tenantId);
    if (tenantSettings?.enableOnAccountSales !== true) {
      return NextResponse.json(
        { success: false, error: t('validation.onAccountNotEnabled', 'On-account sales are not enabled for this store') },
        { status: 403 }
      );
    }

    const rl = checkRateLimit(`balance-payment:${userId}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const body = await request.json();
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount));
    const method = typeof body.method === 'string' ? body.method.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;
    const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : undefined;
    idempotencyKeyForConflictCheck = idempotencyKey;
    tenantIdForConflictCheck = tenantId;

    if (idempotencyKey) {
      const existing = await prisma.customerBalancePayment.findFirst({ where: { tenantId, idempotencyKey } });
      if (existing) {
        return NextResponse.json({ success: true, data: { ...existing, _id: existing.id, amount: Number(existing.amount) } }, { status: 200 });
      }
    }

    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      return NextResponse.json(
        { success: false, error: t('validation.amountRequired', 'A positive payment amount is required') },
        { status: 400 }
      );
    }
    if (!VALID_METHODS.includes(method as (typeof VALID_METHODS)[number])) {
      return NextResponse.json(
        { success: false, error: t('validation.invalidPaymentMethod', 'Invalid payment method') },
        { status: 400 }
      );
    }

    let balanceBefore = 0;
    let balanceAfter = 0;

    // Guard against a "not found or inactive" / "exceeds balance" early-exit
    // response being generated from inside the transaction closure.
    let earlyResponse: NextResponse | null = null;

    const record = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
      if (!customer) {
        earlyResponse = NextResponse.json(
          { success: false, error: t('validation.customerNotFound', 'Customer not found or inactive') },
          { status: 404 }
        );
        return null;
      }

      balanceBefore = Number(customer.accountBalance ?? 0);
      if (amount - balanceBefore > 0.01) {
        earlyResponse = NextResponse.json(
          {
            success: false,
            error: t('validation.paymentExceedsBalance', "Amount cannot exceed the customer's outstanding balance"),
          },
          { status: 400 }
        );
        return null;
      }

      const created = await tx.customerBalancePayment.create({
        data: {
          id: randomUUID(),
          tenantId,
          customerId: customer.id,
          amount,
          method: method as (typeof VALID_METHODS)[number],
          notes,
          recordedById: userId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { accountBalance: { decrement: amount } },
      });
      balanceAfter = balanceBefore - amount;

      return created;
    });

    if (earlyResponse) {
      return earlyResponse;
    }
    if (!record) {
      throw new Error('Failed to create balance payment');
    }

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'customer_balance_payment',
      entityId: record.id,
      changes: {
        customerId,
        amount,
        method,
        accountBalanceBefore: balanceBefore,
        accountBalanceAfter: balanceAfter,
      },
    });

    return NextResponse.json(
      { success: true, data: { ...record, _id: record.id, amount: Number(record.amount) } },
      { status: 201 }
    );
  } catch (error: unknown) {
    // A concurrent duplicate request (same idempotencyKey) raced us and won —
    // return that payment instead of a generic failure.
    if (
      idempotencyKeyForConflictCheck &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray((error.meta as { target?: string[] })?.target) &&
      (error.meta as { target?: string[] }).target?.includes('idempotencyKey')
    ) {
      const existing = await prisma.customerBalancePayment.findFirst({
        where: {
          tenantId: tenantIdForConflictCheck,
          idempotencyKey: idempotencyKeyForConflictCheck,
        },
      });
      if (existing) {
        return NextResponse.json(
          { success: true, data: { ...existing, _id: existing.id, amount: Number(existing.amount) } },
          { status: 200 }
        );
      }
    }
    logger.error('balance-payments POST:', error);
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
