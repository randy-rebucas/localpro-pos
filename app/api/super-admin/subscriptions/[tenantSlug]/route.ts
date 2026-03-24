import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import Tenant from '@/models/Tenant';
import SubscriptionPlan from '@/models/SubscriptionPlan';
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
    await requireRole(request, ['super_admin']);

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
        subscription.planId = planId;
        await subscription.save();
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.assign_plan',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { planId: { from: previousStatus, to: planId } },
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
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        await subscription.save();
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.cancel',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'cancelled' } },
        });
        break;
      }
      case 'activate': {
        subscription.status = 'active';
        subscription.isTrial = false;
        const nextBilling = new Date();
        if (subscription.billingCycle === 'yearly') {
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        } else {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        subscription.nextBillingDate = nextBilling;
        await subscription.save();
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
        subscription.status = 'suspended';
        subscription.suspendedAt = new Date();
        await subscription.save();
        await createAuditLog(request, {
          tenantId,
          action: 'subscription.suspend',
          entityType: 'Subscription',
          entityId: String(subscription._id),
          changes: { status: { from: previousStatus, to: 'suspended' } },
        });
        break;
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

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
