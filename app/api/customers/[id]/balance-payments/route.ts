import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Customer from '@/models/Customer';
import CustomerBalancePayment from '@/models/CustomerBalancePayment';
import { requireTenantAccess } from '@/lib/api-tenant';
import { requireRole } from '@/lib/auth';
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
    await connectDB();
    const { id: customerId } = await params;

    let tenantId: string;
    try {
      const access = await requireTenantAccess(request);
      tenantId = access.tenantId;
      await requireRole(request, ['cashier', 'manager', 'admin', 'owner']);
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

    const customer = await Customer.findOne({ _id: customerId, tenantId }).select('_id').lean();
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(1, rawLimit), 100);

    const payments = await CustomerBalancePayment.find({ tenantId, customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

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
  try {
    await connectDB();
    const { id: customerId } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    let tenantId: string;
    let userId: string;
    try {
      const access = await requireTenantAccess(request);
      tenantId = access.tenantId;
      userId = access.user.userId;
      await requireRole(request, ['cashier', 'manager', 'admin', 'owner']);
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

    const session = await mongoose.startSession();
    let record;
    let balanceBefore = 0;
    let balanceAfter = 0;
    try {
      session.startTransaction();

      const customer = await Customer.findOne({ _id: customerId, tenantId, isActive: true }).session(session);
      if (!customer) {
        await session.abortTransaction();
        return NextResponse.json(
          { success: false, error: t('validation.customerNotFound', 'Customer not found or inactive') },
          { status: 404 }
        );
      }

      balanceBefore = customer.accountBalance ?? 0;
      if (amount - balanceBefore > 0.01) {
        await session.abortTransaction();
        return NextResponse.json(
          {
            success: false,
            error: t('validation.paymentExceedsBalance', "Amount cannot exceed the customer's outstanding balance"),
          },
          { status: 400 }
        );
      }

      const [created] = await CustomerBalancePayment.create(
        [
          {
            tenantId,
            customerId: customer._id,
            amount,
            method: method as (typeof VALID_METHODS)[number],
            notes,
            recordedBy: new mongoose.Types.ObjectId(userId) as Types.ObjectId,
          },
        ],
        { session }
      );
      record = created;

      await Customer.updateOne(
        { _id: customerId, tenantId },
        { $inc: { accountBalance: -amount } },
        { session }
      );
      balanceAfter = balanceBefore - amount;

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    await createAuditLog(request, {
      tenantId,
      userId,
      action: AuditActions.PAYMENT_CREATE,
      entityType: 'customer_balance_payment',
      entityId: record._id.toString(),
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
    logger.error('balance-payments POST:', error);
    const message = error instanceof Error ? error.message : 'Failed to record payment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
