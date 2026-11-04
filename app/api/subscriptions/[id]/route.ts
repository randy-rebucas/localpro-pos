import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type Patch, type SubscriptionFields, type SubscriptionStatus } from '@/lib/db';
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
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription lookup by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const subscription = await getRepos().subscriptions.findByIdAcrossTenants(id, {
      populate: { tenant: 'slug name settings', plan: 'name tier price features birCompliance isCustom' },
    });

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
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription mutation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const body = await request.json();
    const { status, billingCycle, autoRenew, planId } = body;

    const { subscriptions, subscriptionPlans } = getRepos();
    const subscription = await subscriptions.findByIdAcrossTenants(id);
    if (!subscription) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionNotFound', 'Subscription not found') },
        { status: 404 }
      );
    }

    const currentStatus = subscription.status;
    const changes: Patch<SubscriptionFields> = {};

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
      const plan = await subscriptionPlans.findById(planId);
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
    const tenantId = subscription.tenantId as string;
    const updatedSubscription = await subscriptions.update(tenantId, id, { set: changes }, {
      ifStatus: currentStatus,
      populate: { tenant: 'slug name', plan: 'name tier price features birCompliance isCustom' },
    });

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
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'subscription',
      entityId: subscription._id,
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
    const t = await getValidationTranslatorFromRequest(request);
    // Cross-tenant subscription cancellation by id — super_admin only
    await requireRole(request, ['super_admin']);
    const { id } = await params;

    const subscription = await getRepos().subscriptions.softDeleteAcrossTenants(id);
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
      entityId: subscription._id,

      changes: { softDeleted: true },
    });

    return NextResponse.json({ success: true, message: 'Subscription deleted successfully' });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}