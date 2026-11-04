import { NextRequest, NextResponse } from 'next/server';
import {
  getRepos,
  isDuplicateKeyError,
  runInTransaction,
  type BillingEventInput,
  type BillingEventType,
  type DbTx,
  type Patch,
  type Subscription,
  type SubscriptionFields,
  type SubscriptionUpdate,
} from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

function resolveTenant(slug: string) {
  return getRepos().tenants.findBySlug(slug, { select: '_id slug name' });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await getRepos().subscriptions.findByTenant(tenant._id, {
      populate: { plan: 'name tier price features' },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

// A validation failure here (missing field, plan not found, invalid date, positive-amount
// check) surfaces as { error } and must be resolved *before* the transaction opens below —
// nothing here reads/writes inside the transaction.
async function validateAction(action: string, body: Record<string, unknown>, subscription: Subscription): Promise<{ error: string; status: number } | null> {
  switch (action) {
    case 'assign-plan': {
      if (!body.planId) return { error: 'planId is required', status: 400 };
      const plan = await getRepos().subscriptionPlans.findById(body.planId as string);
      if (!plan) return { error: 'Plan not found', status: 404 };
      if (body.nextBillingDate && isNaN(new Date(body.nextBillingDate as string).getTime())) {
        return { error: 'Invalid nextBillingDate', status: 400 };
      }
      return null;
    }
    case 'extend-trial': {
      const days = parseInt(body.days as string) || 0;
      if (days <= 0) return { error: 'days must be a positive integer', status: 400 };
      return null;
    }
    case 'activate': {
      if ((subscription.outstandingBalance || 0) > 0) {
        return { error: `Outstanding balance of ${subscription.outstandingBalance} must be settled (via record-payment) before reactivating`, status: 400 };
      }
      // Reactivating a cancelled subscription is a deliberate win-back, not a
      // routine unpause/unsuspend — require the admin to record why.
      if (subscription.status === 'cancelled' && !(body.reactivationReason as string | undefined)?.trim()) {
        return { error: 'reactivationReason is required to reactivate a cancelled subscription', status: 400 };
      }
      return null;
    }
    case 'record-payment': {
      if (!body.amount || Number(body.amount) <= 0) return { error: 'amount must be a positive number', status: 400 };
      return null;
    }
    case 'cancel':
    case 'suspend':
    case 'pause':
    case 'resume':
      return null;
    default:
      return { error: `Unknown action: ${action}`, status: 400 };
  }
}

interface AuditPlan { changes: Record<string, unknown> }

function nextBillingFrom(now: Date, billingCycle: Subscription['billingCycle']): Date {
  const next = new Date(now);
  if (billingCycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

// Applies the mutation for `action` against `subscription` (and, for a few actions, the
// tenant's isActive flag + a BillingEvent) inside the caller's transaction. Returns
// the audit-log changes payload for the caller to log once the transaction has committed.
async function applyAction(
  action: string,
  body: Record<string, unknown>,
  subscription: Subscription,
  tenantId: string,
  adminUserId: string,
  previousStatus: string,
  tx: DbTx
): Promise<AuditPlan> {
  const { subscriptions, billingEvents, tenants } = getRepos();
  const save = (ops: SubscriptionUpdate) => subscriptions.update(tenantId, subscription._id, ops, { tx });
  const recordEvent = (type: BillingEventType, description: string, extra: Partial<BillingEventInput> = {}) =>
    billingEvents.create(tenantId, {
      subscriptionId: subscription._id,
      type,
      amount: 0,
      currency: 'PHP',
      description,
      recordedBy: adminUserId,
      ...extra,
    }, { tx });

  switch (action) {
    case 'assign-plan': {
      const planId = body.planId as string;
      const previousPlanId = subscription.planId;
      const now = new Date();
      const nextBilling = body.nextBillingDate
        ? new Date(body.nextBillingDate as string)
        : nextBillingFrom(now, subscription.billingCycle);
      await save({
        set: {
          planId,
          status: 'active',
          isTrial: false,
          startDate: now,
          nextBillingDate: nextBilling,
          trialEndDate: null,
          endDate: null,
          cancelledAt: null,
          suspendedAt: null,
        },
      });
      return {
        changes: {
          planId: { from: previousPlanId, to: planId },
          status: { from: previousStatus, to: 'active' },
          isTrial: { from: true, to: false },
          startDate: now,
        },
      };
    }
    case 'extend-trial': {
      const days = parseInt(body.days as string) || 0;
      const base = subscription.trialEndDate && subscription.trialEndDate > new Date()
        ? subscription.trialEndDate
        : new Date();
      const trialEndDate = new Date(base.getTime() + days * 86_400_000);
      await save({ set: { trialEndDate, nextBillingDate: trialEndDate, status: 'trial' } });
      return { changes: { trialEndDate, days } };
    }
    case 'cancel': {
      const cancelReason = body.reason as string | undefined;
      await save({
        set: { status: 'cancelled', cancelledAt: new Date(), ...(cancelReason && { cancellationReason: cancelReason }) },
      });
      await recordEvent('subscription_cancelled', cancelReason || 'Cancelled by super-admin');
      return { changes: { status: { from: previousStatus, to: 'cancelled' }, reason: cancelReason } };
    }
    case 'activate': {
      const wasTrial = subscription.isTrial;
      const wasDeactivated = !!subscription.deactivatedAt;
      const wasCancelled = previousStatus === 'cancelled';
      const reactivationReason = (body.reactivationReason as string | undefined)?.trim();
      await save({
        set: {
          status: 'active',
          isTrial: false,
          ...(wasTrial && !subscription.trialConvertedAt && { trialConvertedAt: new Date() }),
          nextBillingDate: nextBillingFrom(new Date(), subscription.billingCycle),
          gracePeriodEndDate: null,
          paymentOverdue: false,
          deactivatedAt: null,
          lateFeeAppliedAt: null,
          reactivationFeeAppliedAt: null,
        },
      });
      if (wasDeactivated) {
        await tenants.update(tenantId, { set: { isActive: true } }, { tx });
        await recordEvent('account_reactivated', 'Account reactivated by super-admin after outstanding balance settled');
      }
      if (wasTrial) {
        await recordEvent('trial_converted', 'Trial converted to active subscription by super-admin');
      }
      if (wasCancelled) {
        await recordEvent('account_reactivated', `Reactivated from cancelled by super-admin: ${reactivationReason}`);
      }
      return { changes: { status: { from: previousStatus, to: 'active' }, reactivationReason: wasCancelled ? reactivationReason : undefined } };
    }
    case 'suspend': {
      const graceDays = body.graceDays as number | undefined;
      const set: Patch<SubscriptionFields> = { status: 'suspended', suspendedAt: new Date() };
      if (graceDays && Number(graceDays) > 0) {
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + Number(graceDays));
        set.gracePeriodEndDate = graceEnd;
      }
      await save({ set });
      await recordEvent('subscription_suspended', `Suspended by super-admin${graceDays ? ` (grace period: ${graceDays} days)` : ''}`);
      return { changes: { status: { from: previousStatus, to: 'suspended' } } };
    }
    case 'pause': {
      const pauseReason = body.pauseReason as string | undefined;
      const pauseDays = body.pauseDays as number | undefined;
      const set: Patch<SubscriptionFields> = { status: 'paused', pausedAt: new Date() };
      if (pauseReason) set.pauseReason = pauseReason;
      if (pauseDays && Number(pauseDays) > 0) {
        const pauseEnd = new Date();
        pauseEnd.setDate(pauseEnd.getDate() + Number(pauseDays));
        set.pauseEndsAt = pauseEnd;
      }
      await save({ set });
      await recordEvent('subscription_paused', pauseReason || 'Paused by super-admin');
      return { changes: { status: { from: previousStatus, to: 'paused' }, pauseReason } };
    }
    case 'resume': {
      await save({ set: { status: 'active', pausedAt: null, pauseReason: null, pauseEndsAt: null } });
      await recordEvent('subscription_resumed', 'Resumed by super-admin');
      return { changes: { status: { from: previousStatus, to: 'active' } } };
    }
    case 'record-payment': {
      const payAmount = Number(body.amount);
      const payNotes = body.notes as string | undefined;
      const payTxId = body.transactionId as string | undefined;
      await recordEvent('payment_received', payNotes || 'Manual payment recorded by super-admin', {
        amount: payAmount,
        notes: payNotes,
        transactionId: payTxId,
      });

      const outstandingBalance = Math.max(0, (subscription.outstandingBalance || 0) - payAmount);
      const wasDeactivated = !!subscription.deactivatedAt || subscription.status === 'suspended';
      const fullyPaid = outstandingBalance <= 0;
      const wasOverdue = subscription.paymentOverdue;

      const set: Patch<SubscriptionFields> = { outstandingBalance };
      if (fullyPaid && (wasOverdue || wasDeactivated)) {
        Object.assign(set, {
          nextBillingDate: nextBillingFrom(new Date(), subscription.billingCycle),
          paymentOverdue: false,
          gracePeriodEndDate: null,
          deactivatedAt: null,
          lateFeeAppliedAt: null,
          reactivationFeeAppliedAt: null,
          ...(wasDeactivated && { status: 'active' }),
        });
      }
      await save({
        set,
        addBillingEntry: { date: new Date(), amount: payAmount, currency: 'PHP', status: 'paid', transactionId: payTxId },
      });

      if (fullyPaid && wasDeactivated) {
        await tenants.update(tenantId, { set: { isActive: true } }, { tx });
        await recordEvent('account_reactivated', 'Account reactivated automatically after payment settled outstanding balance');
      }
      return { changes: { amount: payAmount, transactionId: payTxId, outstandingBalance, fullyPaid } };
    }
    default:
      // Unreachable — validateAction already rejected unknown actions.
      throw new Error(`Unknown action: ${action}`);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    // SuperAdminAction is not behind the repository layer yet
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    const { subscriptions, billingEvents } = getRepos();
    const subscription = (await subscriptions.findByTenant(tenant._id)) as Subscription | null;
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    const tenantId = tenant._id;
    const previousStatus = subscription.status;
    const current = () => subscriptions.findById(tenantId, subscription._id, { populate: { plan: 'name tier price' } });

    const validationError = await validateAction(action, body, subscription);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError.error }, { status: validationError.status });
    }

    // Idempotency: a double-click or a retried request with the same
    // transactionId must not double-credit the account — payment recording
    // is the highest-risk action here since it moves money on the ledger.
    if (action === 'record-payment' && body.transactionId) {
      const alreadyRecorded = await billingEvents.findByTransactionId(tenantId, body.transactionId, {
        subscriptionId: subscription._id,
        type: 'payment_received',
      });
      if (alreadyRecorded) {
        return NextResponse.json({ success: true, data: await current() });
      }
    }

    // Every action here writes the subscription plus at least one billing
    // event (and sometimes the tenant's isActive flag) — these must land
    // together or the ledger/tenant state can drift from the subscription
    // (e.g. status flipped to cancelled with no matching billing event).
    let auditPlan: AuditPlan;
    try {
      auditPlan = await runInTransaction((tx) =>
        applyAction(action, body, subscription, tenantId, adminUser.userId, previousStatus, tx)
      );
    } catch (e) {
      // A concurrent request recorded this exact payment between our
      // pre-check above and this transaction's insert — the unique index
      // on {tenantId, transactionId} caught it. Treat as already-applied.
      if (action === 'record-payment' && body.transactionId && isDuplicateKeyError(e)) {
        return NextResponse.json({ success: true, data: await current() });
      }
      throw e;
    }

    await createAuditLog(request, {
      tenantId,
      userId: adminUser.userId,
      action: `subscription.${action.replace(/-/g, '_')}`,
      entityType: 'Subscription',
      entityId: subscription._id,
      changes: auditPlan.changes,
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await getRepos().superAdminActions.create({
      adminUserId: adminUser.userId,
      action: `subscription.${action}`,
      targetType: 'Subscription',
      targetId: subscription._id,
      description: `Action "${action}" on subscription for tenant ${tenantSlug}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true, data: await current() });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
