import { NextRequest, NextResponse } from 'next/server';
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

    switch (action) {
      case 'assign-plan': {
        const { planId } = body;
        if (!planId) {
          return NextResponse.json({ success: false, error: 'planId is required' }, { status: 400 });
        }
        const plan = await SubscriptionPlan.findById(planId).lean();
        if (!plan) {
          return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
        }
        const previousPlanId = String(subscription.planId);
        const now = new Date();
        let nextBilling: Date;
        if (body.nextBillingDate) {
          nextBilling = new Date(body.nextBillingDate as string);
          if (isNaN(nextBilling.getTime())) {
            return NextResponse.json({ success: false, error: 'Invalid nextBillingDate' }, { status: 400 });
          }
        } else {
          nextBilling = new Date(now);
          if (subscription.billingCycle === 'yearly') {
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          } else {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
          }
        }
        subscription.planId = planId;
        subscription.status = 'active';
        subscription.isTrial = false;
        subscription.startDate = now;
        subscription.nextBillingDate = nextBilling;
        subscription.trialEndDate = undefined;
        subscription.endDate = undefined;
        subscription.cancelledAt = undefined;
        subscription.suspendedAt = undefined;
        await subscription.save();
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.assign_plan',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: {
            planId: { from: previousPlanId, to: planId },
            status: { from: previousStatus, to: 'active' },
            isTrial: { from: true, to: false },
            startDate: now,
          },
        });
        break;
      }
      case 'extend-trial': {
        const days = parseInt(body.days) || 0;
        if (days <= 0) {
          return NextResponse.json({ success: false, error: 'days must be a positive integer' }, { status: 400 });
        }
        const base = subscription.trialEndDate && subscription.trialEndDate > new Date()
          ? subscription.trialEndDate
          : new Date();
        subscription.trialEndDate = new Date(base.getTime() + days * 86_400_000);
        subscription.nextBillingDate = subscription.trialEndDate;
        if (subscription.status !== 'trial') subscription.status = 'trial';
        await subscription.save();
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.extend_trial',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { trialEndDate: subscription.trialEndDate, days },
        });
        break;
      }
      case 'cancel': {
        const { reason: cancelReason } = body;
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        if (cancelReason) subscription.cancellationReason = cancelReason;
        await subscription.save();
        await BillingEvent.create({
          tenantId,
          subscriptionId: subscription._id,
          type: 'subscription_cancelled',
          amount: 0,
          currency: 'PHP',
          description: cancelReason || 'Cancelled by super-admin',
          recordedBy: adminUser.userId,
        });
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.cancel',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'cancelled' }, reason: cancelReason },
        });
        break;
      }
      case 'activate': {
        const wasTrial = subscription.isTrial;
        subscription.status = 'active';
        subscription.isTrial = false;
        if (wasTrial && !subscription.trialConvertedAt) {
          subscription.trialConvertedAt = new Date();
        }
        const nextBilling = new Date();
        if (subscription.billingCycle === 'yearly') {
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        } else {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        subscription.nextBillingDate = nextBilling;
        subscription.gracePeriodEndDate = undefined;
        await subscription.save();
        if (wasTrial) {
          await BillingEvent.create({
            tenantId,
            subscriptionId: subscription._id,
            type: 'trial_converted',
            amount: 0,
            currency: 'PHP',
            description: 'Trial converted to active subscription by super-admin',
            recordedBy: adminUser.userId,
          });
        }
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.activate',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'active' } },
        });
        break;
      }
      case 'suspend': {
        const { graceDays } = body;
        subscription.status = 'suspended';
        subscription.suspendedAt = new Date();
        if (graceDays && Number(graceDays) > 0) {
          const graceEnd = new Date();
          graceEnd.setDate(graceEnd.getDate() + Number(graceDays));
          subscription.gracePeriodEndDate = graceEnd;
        }
        await subscription.save();
        await BillingEvent.create({
          tenantId,
          subscriptionId: subscription._id,
          type: 'subscription_suspended',
          amount: 0,
          currency: 'PHP',
          description: `Suspended by super-admin${graceDays ? ` (grace period: ${graceDays} days)` : ''}`,
          recordedBy: adminUser.userId,
        });
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.suspend',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'suspended' } },
        });
        break;
      }
      case 'pause': {
        const { pauseReason, pauseDays } = body;
        subscription.status = 'paused';
        subscription.pausedAt = new Date();
        if (pauseReason) subscription.pauseReason = pauseReason;
        if (pauseDays && Number(pauseDays) > 0) {
          const pauseEnd = new Date();
          pauseEnd.setDate(pauseEnd.getDate() + Number(pauseDays));
          subscription.pauseEndsAt = pauseEnd;
        }
        await subscription.save();
        await BillingEvent.create({
          tenantId,
          subscriptionId: subscription._id,
          type: 'subscription_paused',
          amount: 0,
          currency: 'PHP',
          description: pauseReason || 'Paused by super-admin',
          recordedBy: adminUser.userId,
        });
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.pause',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'paused' }, pauseReason },
        });
        break;
      }
      case 'resume': {
        subscription.status = 'active';
        subscription.pausedAt = undefined;
        subscription.pauseReason = undefined;
        subscription.pauseEndsAt = undefined;
        await subscription.save();
        await BillingEvent.create({
          tenantId,
          subscriptionId: subscription._id,
          type: 'subscription_resumed',
          amount: 0,
          currency: 'PHP',
          description: 'Resumed by super-admin',
          recordedBy: adminUser.userId,
        });
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.resume',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'active' } },
        });
        break;
      }
      case 'record-payment': {
        const { amount: payAmount, notes: payNotes, transactionId: payTxId } = body;
        if (!payAmount || Number(payAmount) <= 0) {
          return NextResponse.json({ success: false, error: 'amount must be a positive number' }, { status: 400 });
        }
        await BillingEvent.create({
          tenantId,
          subscriptionId: subscription._id,
          type: 'payment_received',
          amount: Number(payAmount),
          currency: 'PHP',
          description: payNotes || 'Manual payment recorded by super-admin',
          notes: payNotes,
          transactionId: payTxId,
          recordedBy: adminUser.userId,
        });
        subscription.billingHistory.push({
          date: new Date(),
          amount: Number(payAmount),
          currency: 'PHP',
          status: 'paid',
          transactionId: payTxId,
        });
        await subscription.save();
        break;
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

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
