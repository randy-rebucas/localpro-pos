import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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

    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
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
      data: payments.map(({ id, amount, ...rest }) => ({ _id: id, ...rest, amount: Number(amount) })),
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
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount));
    const method = typeof body.method === 'string' ? body.method.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;

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

    let record: { id: string } | null = null;
    let balanceBefore = 0;
    let balanceAfter = 0;

    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
      if (!customer) {
        throw Object.assign(new Error('CUSTOMER_NOT_FOUND'), { code: 'CUSTOMER_NOT_FOUND' });
      }

      balanceBefore = Number(customer.accountBalance ?? 0);
      if (amount - balanceBefore > 0.01) {
        throw Object.assign(new Error('EXCEEDS_BALANCE'), { code: 'EXCEEDS_BALANCE' });
      }

      const created = await tx.customerBalancePayment.create({
        data: {
          tenantId,
          customerId: customer.id,
          amount,
          method: method as (typeof VALID_METHODS)[number],
          notes,
          recordedBy: userId,
        },
      });
      record = created;

      balanceAfter = balanceBefore - amount;

      await tx.customer.update({
        where: { id: customerId },
        data: { accountBalance: { decrement: amount } },
      });
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === 'CUSTOMER_NOT_FOUND') {
        throw { status: 404, message: t('validation.customerNotFound', 'Customer not found or inactive') };
      }
      if (e instanceof Error && e.message === 'EXCEEDS_BALANCE') {
        throw {
          status: 400,
          message: t('validation.paymentExceedsBalance', "Amount cannot exceed the customer's outstanding balance"),
        };
      }
      throw e;
    });

    if (!record) {
      // Should be unreachable, but guards TypeScript narrowing
      return NextResponse.json({ success: false, error: 'Failed to record payment' }, { status: 500 });
    }

    const createdRecord = record as { id: string };

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'customer_balance_payment',
      entityId: createdRecord.id,
      changes: {
        customerId,
        amount,
        method,
        accountBalanceBefore: balanceBefore,
        accountBalanceAfter: balanceAfter,
      },
    });

    return NextResponse.json(
      { success: true, data: { _id: createdRecord.id, tenantId, customerId, amount, method, notes, recordedBy: userId } },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
      const e = error as { status: number; message: string };
      return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    }
    logger.error('balance-payments POST:', error);
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
