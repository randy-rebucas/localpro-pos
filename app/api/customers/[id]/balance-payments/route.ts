import { NextRequest, NextResponse } from 'next/server';
import { DuplicateKeyError, getRepos, runInTransaction, type BalancePayment } from '@/lib/db';
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
    const customer = await getRepos().customers.findById(tenantId, customerId, { select: '_id' });
    if (!customer) {
      return NextResponse.json({ success: false, error: t('validation.customerNotFound', 'Customer not found') }, { status: 404 });
    }

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const payments = await getRepos().balancePayments.list(tenantId, customerId, { limit });

    return NextResponse.json({ success: true, data: payments });
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
      const existing = await getRepos().balancePayments.findByIdempotencyKey(tenantId, idempotencyKey);
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
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

    // The payment record and the balance decrement land together or not at all
    const { customers, balancePayments } = getRepos();
    const outcome = await runInTransaction(async (tx) => {
      const customer = await customers.findOne(tenantId, { ids: [customerId], isActive: true }, { tx });
      if (!customer) return { error: 'notFound' as const };

      const before = customer.accountBalance ?? 0;
      if (amount - before > 0.01) return { error: 'exceedsBalance' as const };

      const created = await balancePayments.create(
        tenantId,
        {
          customerId: customer._id,
          amount,
          method: method as BalancePayment['method'],
          notes,
          recordedBy: userId,
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
        { tx }
      );
      await customers.adjustAccountBalance(tenantId, customerId, -amount, { tx });
      return { record: created, balanceBefore: before, balanceAfter: before - amount };
    });

    if ('error' in outcome) {
      return outcome.error === 'notFound'
        ? NextResponse.json(
            { success: false, error: t('validation.customerNotFound', 'Customer not found or inactive') },
            { status: 404 }
          )
        : NextResponse.json(
            {
              success: false,
              error: t('validation.paymentExceedsBalance', "Amount cannot exceed the customer's outstanding balance"),
            },
            { status: 400 }
          );
    }
    const { record, balanceBefore, balanceAfter } = outcome;

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'customer_balance_payment',
      entityId: record._id,
      changes: {
        customerId,
        amount,
        method,
        accountBalanceBefore: balanceBefore,
        accountBalanceAfter: balanceAfter,
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: unknown) {
    // A concurrent duplicate request (same idempotencyKey) raced us and won —
    // return that payment instead of a generic failure.
    if (
      idempotencyKeyForConflictCheck &&
      tenantIdForConflictCheck &&
      error instanceof DuplicateKeyError &&
      error.field === 'idempotencyKey'
    ) {
      const existing = await getRepos().balancePayments.findByIdempotencyKey(
        tenantIdForConflictCheck,
        idempotencyKeyForConflictCheck
      );
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 });
      }
    }
    logger.error('balance-payments POST:', error);
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
