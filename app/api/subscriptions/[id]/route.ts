import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription, { SubscriptionStatus } from '@/models/Subscription';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

// Legal next-states for each current subscription status. Prevents e.g. flipping
// a cancelled subscription straight back to active without going through the
// dedicated reactivation/payment flow, or leaving stale cancelledAt/suspendedAt
// timestamps behind on a subscription that reads as active.
const ALLOWED_STATUS_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial: ['active', 'cancelled', 'suspended', 'inactive'],
  active: ['cancelled', 'suspended', 'inactive', 'paused'],
  suspended: ['active', 'cancelled', 'inactive'],
  cancelled: ['active', 'inactive'],
  inactive: ['active', 'trial'],
  paused: ['active', 'cancelled', 'inactive'],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription lookup by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const subscription = await Subscription.findById(id)
      .populate('tenantId', 'slug name settings')
      .populate('planId', 'name tier price features birCompliance isCustom')
      .lean();

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionNotFound', 'Subscription not found') },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription mutation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const body = await request.json();
    const { status, billingCycle, autoRenew, planId } = body;

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionNotFound', 'Subscription not found') },
        { status: 404 }
      );
    }

    const currentStatus = subscription.status;
    const changes: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Update status if provided, validating the transition is legal from the
    // subscription's current status before mutating.
    if (status && ['active', 'inactive', 'cancelled', 'suspended', 'trial'].includes(status)) {
      if (status !== currentStatus && !ALLOWED_STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
        return NextResponse.json(
          {
            success: false,
            error: t(
              'validation.invalidSubscriptionStatusTransition',
              `Cannot change subscription status from "${currentStatus}" to "${status}"`
            ),
          },
          { status: 400 }
        );
      }
      changes.status = status;
      if (status === 'cancelled') {
        changes.cancelledAt = new Date();
        changes.autoRenew = false;
      } else if (status === 'suspended') {
        changes.suspendedAt = new Date();
      } else if (status === 'active') {
        // Leaving a cancelled/suspended state — clear the stale timestamps so
        // the subscription doesn't read as active while still carrying a
        // cancellation/suspension record.
        changes.cancelledAt = null;
        changes.suspendedAt = null;
      }
    }

    // Update billing cycle if provided — also recalculate nextBillingDate
    if (billingCycle && ['monthly', 'yearly'].includes(billingCycle)) {
      changes.billingCycle = billingCycle;
      const next = new Date();
      if (billingCycle === 'yearly') {
        next.setFullYear(next.getFullYear() + 1);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      changes.nextBillingDate = next;
    }

    // Update auto-renew if provided
    if (typeof autoRenew === 'boolean') {
      changes.autoRenew = autoRenew;
    }

    // Update plan if provided
    if (planId) {
      // Verify plan exists
      const SubscriptionPlan = (await import('@/models/SubscriptionPlan')).default;
      const plan = await SubscriptionPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return NextResponse.json(
          { success: false, error: t('validation.subscriptionPlanNotFoundOrInactive', 'Subscription plan not found or inactive') },
          { status: 404 }
        );
      }
      changes.planId = planId;
    }

    // Precondition on the status read above so a concurrent PUT (e.g. an admin
    // cancelling while the expiry cron suspends the same subscription) can't
    // silently clobber the other's change — whichever request loses the race
    // gets a 409 instead of a last-write-wins overwrite.
    const updatedSubscription = await Subscription.findOneAndUpdate(
      { _id: id, status: currentStatus },
      changes,
      { new: true }
    ).populate('tenantId', 'slug name')
     .populate('planId', 'name tier price features birCompliance isCustom');

    if (!updatedSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: t(
            'validation.subscriptionConflict',
            'This subscription was changed by another request. Please refresh and try again.'
          ),
        },
        { status: 409 }
      );
    }

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.UPDATE,
      entityType: 'subscription',
      entityId: subscription._id.toString(),
      changes,
    });

    return NextResponse.json({ success: true, data: updatedSubscription });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription cancellation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const subscription = await Subscription.findOneAndUpdate(
      { _id: id, isActive: true },
      { isActive: false, status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionNotFound', 'Subscription not found') },
        { status: 404 }
      );
    }

    await createAuditLog(request, {
      tenantId: subscription.tenantId,
      action: AuditActions.DELETE,
      entityType: 'subscription',
      entityId: subscription._id.toString(),
      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}