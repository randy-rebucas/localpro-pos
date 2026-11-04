import { NextRequest, NextResponse } from 'next/server';
import { getRepos, isDuplicateKeyError, type SubscriptionInput, type SubscriptionStatus } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    // Cross-tenant subscription list — super_admin only
    await requireRole(request, ['super_admin']);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const { items: subscriptions } = await getRepos().subscriptions.listAcrossTenants(
      { notDisabled: true, ...(status && { status: status as SubscriptionStatus }) },
      { populate: { tenant: 'slug name', plan: 'name tier price features birCompliance isCustom' } }
    );

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized' || (error as Error).message.includes('Forbidden')) {
      return NextResponse.json(
        { success: false, error: (error as Error).message },
        { status: (error as Error).message === 'Unauthorized' ? 401 : 403 }
      );
    }
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json({ success: false, error: t('validation.failedToFetchSubscriptions', 'Failed to fetch subscriptions') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const t = await getValidationTranslatorFromRequest(request);

    // Creating a subscription for an arbitrary tenantId — super_admin only
    await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { tenantId, planId, billingCycle = 'monthly', isTrial = false } = body;

    if (!tenantId || !planId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantAndPlanIdRequired', 'Tenant ID and Plan ID are required') },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const { tenants, subscriptions, subscriptionPlans } = getRepos();
    const tenant = await tenants.findById(String(tenantId), { select: '_id' });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Check if tenant already has an active subscription
    const existingSubscription = await subscriptions.findByTenant(tenant._id, { status: ['active', 'trial'] });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasActiveSubscription', 'Tenant already has an active subscription') },
        { status: 400 }
      );
    }

    // Verify plan exists and is active
    const plan = await subscriptionPlans.findById(planId);
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionPlanNotFoundOrInactive', 'Subscription plan not found or inactive') },
        { status: 404 }
      );
    }

    const now = new Date();
    const subscriptionData: SubscriptionInput = {
      planId,
      status: isTrial ? 'trial' : 'active',
      billingCycle,
      startDate: now,
      isTrial,
      autoRenew: true,
      usage: {
        currentUsers: 1, // Admin user
        currentBranches: 1,
        currentProducts: 0,
        currentTransactions: 0,
        lastResetDate: now,
      },
    };

    // Set trial period (30 days) if applicable
    if (isTrial) {
      const trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + 30);
      subscriptionData.trialEndDate = trialEndDate;
      subscriptionData.nextBillingDate = trialEndDate;
    } else {
      // Set next billing date for paid subscription
      const nextBilling = new Date(now);
      if (billingCycle === 'yearly') {
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      } else {
        nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      subscriptionData.nextBillingDate = nextBilling;
    }

    // A single write, so no transaction. (Tenant has no subscriptionId path:
    // the former tenant backref was dropped by Mongoose strict mode and never
    // stored anything. The subscription is found by its own tenantId.)
    const subscription = await subscriptions.create(tenant._id, subscriptionData);

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'subscription',
      entityId: subscription._id,
      changes: {
        planId: planId,
        status: subscription.status,
        billingCycle,
        isTrial
      },
    });

    const populatedSubscription = await subscriptions.findById(tenant._id, subscription._id, {
      populate: { tenant: 'slug name', plan: 'name tier price features birCompliance isCustom' },
    });

    return NextResponse.json({
      success: true,
      data: populatedSubscription
    }, { status: 201 });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasSubscription', 'Tenant already has a subscription') },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}