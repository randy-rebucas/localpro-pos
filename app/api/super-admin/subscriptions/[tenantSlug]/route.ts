import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import Tenant from '@/models/Tenant';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import BillingEvent from '@/models/BillingEvent';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

async function resolveTenant(slug: string) {
  return Tenant.findOne({ slug }).select('_id slug name').lean() as Promise<{ _id: unknown; slug: string; name: string } | null>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await Subscription.findOne({ tenantId: tenant._id })
      .populate('planId', 'name tier price features')
      .lean();

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
// nothing here reads/writes with a session.
async function validateAction(action: string, body: Record<string, unknown>, subscription: InstanceType<typeof Subscription>): Promise<{ error: string; status: number } | null> {
  switch (action) {
    case 'assign-plan': {
      if (!body.planId) return { error: 'planId is required', status: 400 };
      const plan = await SubscriptionPlan.findById(body.planId).lean();
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

// Applies the mutation for `action` against `subscription` (and, for a few actions, the
// tenant's isActive flag + a BillingEvent) inside the caller's transaction session. Returns
// the audit-log changes payload for the caller to log once the transaction has committed.
async function applyAction(
  action: string,
  body: Record<string, unknown>,
  subscription: InstanceType<typeof Subscription>,
  tenantId: string,
  adminUserId: string,
  previousStatus: string,
  session: mongoose.ClientSession
): Promise<AuditPlan> {
  switch (action) {
    case 'assign-plan': {
      const planId = body.planId as string;
      const previousPlanId = String(subscription.planId);
      const now = new Date();
      let nextBilling: Date;
      if (body.nextBillingDate) {
        nextBilling = new Date(body.nextBillingDate as string);
      } else {
        nextBilling = new Date(now);
        if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      subscription.planId = new mongoose.Types.ObjectId(planId);
      subscription.status = 'active';
      subscription.isTrial = false;
      subscription.startDate = now;
      subscription.nextBillingDate = nextBilling;
      subscription.trialEndDate = undefined;
      subscription.endDate = undefined;
      subscription.cancelledAt = undefined;
      subscription.suspendedAt = undefined;
      await subscription.save({ session });
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
      subscription.trialEndDate = new Date(base.getTime() + days * 86_400_000);
      subscription.nextBillingDate = subscription.trialEndDate;
      if (subscription.status !== 'trial') subscription.status = 'trial';
      await subscription.save({ session });
      return { changes: { trialEndDate: subscription.trialEndDate, days } };
    }
    case 'cancel': {
      const cancelReason = body.reason as string | undefined;
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      if (cancelReason) subscription.cancellationReason = cancelReason;
      await subscription.save({ session });
      await BillingEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        type: 'subscription_cancelled',
        amount: 0,
        currency: 'PHP',
        description: cancelReason || 'Cancelled by super-admin',
        recordedBy: adminUserId,
      }], { session });
      return { changes: { status: { from: previousStatus, to: 'cancelled' }, reason: cancelReason } };
    }
    case 'activate': {
      const wasTrial = subscription.isTrial;
      const wasDeactivated = !!subscription.deactivatedAt;
      const wasCancelled = previousStatus === 'cancelled';
      const reactivationReason = (body.reactivationReason as string | undefined)?.trim();
      subscription.status = 'active';
      subscription.isTrial = false;
      if (wasTrial && !subscription.trialConvertedAt) subscription.trialConvertedAt = new Date();
      const nextBilling = new Date();
      if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      else nextBilling.setMonth(nextBilling.getMonth() + 1);
      subscription.nextBillingDate = nextBilling;
      subscription.gracePeriodEndDate = undefined;
      subscription.paymentOverdue = false;
      subscription.deactivatedAt = undefined;
      subscription.lateFeeAppliedAt = undefined;
      subscription.reactivationFeeAppliedAt = undefined;
      await subscription.save({ session });
      if (wasDeactivated) {
        await Tenant.findByIdAndUpdate(tenantId, { isActive: true }, { session });
        await BillingEvent.create([{
          tenantId,
          subscriptionId: subscription._id,
          type: 'account_reactivated',
          amount: 0,
          currency: 'PHP',
          description: 'Account reactivated by super-admin after outstanding balance settled',
          recordedBy: adminUserId,
        }], { session });
      }
      if (wasTrial) {
        await BillingEvent.create([{
          tenantId,
          subscriptionId: subscription._id,
          type: 'trial_converted',
          amount: 0,
          currency: 'PHP',
          description: 'Trial converted to active subscription by super-admin',
          recordedBy: adminUserId,
        }], { session });
      }
      if (wasCancelled) {
        await BillingEvent.create([{
          tenantId,
          subscriptionId: subscription._id,
          type: 'account_reactivated',
          amount: 0,
          currency: 'PHP',
          description: `Reactivated from cancelled by super-admin: ${reactivationReason}`,
          recordedBy: adminUserId,
        }], { session });
      }
      return { changes: { status: { from: previousStatus, to: 'active' }, reactivationReason: wasCancelled ? reactivationReason : undefined } };
    }
    case 'suspend': {
      const graceDays = body.graceDays as number | undefined;
      subscription.status = 'suspended';
      subscription.suspendedAt = new Date();
      if (graceDays && Number(graceDays) > 0) {
        const graceEnd = new Date();
        graceEnd.setDate(graceEnd.getDate() + Number(graceDays));
        subscription.gracePeriodEndDate = graceEnd;
      }
      await subscription.save({ session });
      await BillingEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        type: 'subscription_suspended',
        amount: 0,
        currency: 'PHP',
        description: `Suspended by super-admin${graceDays ? ` (grace period: ${graceDays} days)` : ''}`,
        recordedBy: adminUserId,
      }], { session });
      return { changes: { status: { from: previousStatus, to: 'suspended' } } };
    }
    case 'pause': {
      const pauseReason = body.pauseReason as string | undefined;
      const pauseDays = body.pauseDays as number | undefined;
      subscription.status = 'paused';
      subscription.pausedAt = new Date();
      if (pauseReason) subscription.pauseReason = pauseReason;
      if (pauseDays && Number(pauseDays) > 0) {
        const pauseEnd = new Date();
        pauseEnd.setDate(pauseEnd.getDate() + Number(pauseDays));
        subscription.pauseEndsAt = pauseEnd;
      }
      await subscription.save({ session });
      await BillingEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        type: 'subscription_paused',
        amount: 0,
        currency: 'PHP',
        description: pauseReason || 'Paused by super-admin',
        recordedBy: adminUserId,
      }], { session });
      return { changes: { status: { from: previousStatus, to: 'paused' }, pauseReason } };
    }
    case 'resume': {
      subscription.status = 'active';
      subscription.pausedAt = undefined;
      subscription.pauseReason = undefined;
      subscription.pauseEndsAt = undefined;
      await subscription.save({ session });
      await BillingEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        type: 'subscription_resumed',
        amount: 0,
        currency: 'PHP',
        description: 'Resumed by super-admin',
        recordedBy: adminUserId,
      }], { session });
      return { changes: { status: { from: previousStatus, to: 'active' } } };
    }
    case 'record-payment': {
      const payAmount = Number(body.amount);
      const payNotes = body.notes as string | undefined;
      const payTxId = body.transactionId as string | undefined;
      await BillingEvent.create([{
        tenantId,
        subscriptionId: subscription._id,
        type: 'payment_received',
        amount: payAmount,
        currency: 'PHP',
        description: payNotes || 'Manual payment recorded by super-admin',
        notes: payNotes,
        transactionId: payTxId,
        recordedBy: adminUserId,
      }], { session });
      subscription.billingHistory.push({
        date: new Date(),
        amount: payAmount,
        currency: 'PHP',
        status: 'paid',
        transactionId: payTxId,
      });
      subscription.outstandingBalance = Math.max(0, (subscription.outstandingBalance || 0) - payAmount);

      const wasDeactivated = !!subscription.deactivatedAt || subscription.status === 'suspended';
      const fullyPaid = subscription.outstandingBalance <= 0;
      const wasOverdue = subscription.paymentOverdue;

      if (fullyPaid && (wasOverdue || wasDeactivated)) {
        const nextBilling = new Date();
        if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setMonth(nextBilling.getMonth() + 1);
        subscription.nextBillingDate = nextBilling;
        subscription.paymentOverdue = false;
        subscription.gracePeriodEndDate = undefined;
        subscription.deactivatedAt = undefined;
        subscription.lateFeeAppliedAt = undefined;
        subscription.reactivationFeeAppliedAt = undefined;
        if (wasDeactivated) subscription.status = 'active';
      }

      await subscription.save({ session });

      if (fullyPaid && wasDeactivated) {
        await Tenant.findByIdAndUpdate(tenantId, { isActive: true }, { session });
        await BillingEvent.create([{
          tenantId,
          subscriptionId: subscription._id,
          type: 'account_reactivated',
          amount: 0,
          currency: 'PHP',
          description: 'Account reactivated automatically after payment settled outstanding balance',
          recordedBy: adminUserId,
        }], { session });
      }
      return { changes: { amount: payAmount, transactionId: payTxId, outstandingBalance: subscription.outstandingBalance, fullyPaid } };
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
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    const subscription = await Subscription.findOne({ tenantId: tenant._id });
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    const tenantId = String((tenant as { _id: unknown })._id);
    const previousStatus = subscription.status;

    const validationError = await validateAction(action, body, subscription);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError.error }, { status: validationError.status });
    }

    // Idempotency: a double-click or a retried request with the same
    // transactionId must not double-credit the account — payment recording
    // is the highest-risk action here since it moves money on the ledger.
    if (action === 'record-payment' && body.transactionId) {
      const alreadyRecorded = await BillingEvent.findOne({
        tenantId,
        subscriptionId: subscription._id,
        type: 'payment_received',
        transactionId: body.transactionId,
      }).lean();
      if (alreadyRecorded) {
        const current = await Subscription.findById(subscription._id).populate('planId', 'name tier price').lean();
        return NextResponse.json({ success: true, data: current });
      }
    }

    // Every action here writes the subscription plus at least one billing
    // event (and sometimes the tenant's isActive flag) — these must land
    // together or the ledger/tenant state can drift from the subscription
    // (e.g. status flipped to cancelled with no matching billing event).
    const session = await mongoose.startSession();
    let auditPlan: AuditPlan;
    try {
      session.startTransaction();
      auditPlan = await applyAction(action, body, subscription, tenantId, adminUser.userId, previousStatus, session);
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      // A concurrent request recorded this exact payment between our
      // pre-check above and this transaction's insert — the unique index
      // on {tenantId, transactionId} caught it. Treat as already-applied.
      if (action === 'record-payment' && body.transactionId && e instanceof Error && (e as { code?: number }).code === 11000) {
        const current = await Subscription.findById(subscription._id).populate('planId', 'name tier price').lean();
        return NextResponse.json({ success: true, data: current });
      }
      throw e;
    } finally {
      session.endSession();
    }

    await createAuditLog(request, {
      tenantId,
      userId: adminUser.userId,
      action: `subscription.${action.replace(/-/g, '_')}`,
      entityType: 'Subscription',
      entityId: String(subscription._id),
      changes: auditPlan.changes,
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: `subscription.${action}`,
      targetType: 'Subscription',
      targetId: String(subscription._id),
      description: `Action "${action}" on subscription for tenant ${tenantSlug}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    const updated = await Subscription.findById(subscription._id)
      .populate('planId', 'name tier price')
      .lean();

    return NextResponse.json({ success: true, data: updated });
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
