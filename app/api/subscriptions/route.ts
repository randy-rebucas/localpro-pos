import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Cross-tenant subscription list — super_admin only
    await requireRole(request, ['super_admin']);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const query: Record<string, unknown> = { isActive: { $ne: false } };

    if (status) {
      query.status = status;
    }

    const subscriptions = await Subscription.find(query)
      .populate('tenantId', 'slug name')
      .populate('planId', 'name tier price features birCompliance isCustom')
      .sort({ createdAt: -1 })
      .lean();

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
    await connectDB();
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
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    // Check if tenant already has an active subscription
    const existingSubscription = await Subscription.findOne({
      tenantId,
      status: { $in: ['active', 'trial'] }
    });

    if (existingSubscription) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasActiveSubscription', 'Tenant already has an active subscription') },
        { status: 400 }
      );
    }

    // Verify plan exists and is active
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionPlanNotFoundOrInactive', 'Subscription plan not found or inactive') },
        { status: 404 }
      );
    }

    const now = new Date();
    const subscriptionData: Record<string, unknown> = {
      tenantId,
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

    // Subscription create + tenant backref must land together, otherwise a
    // failure between the two leaves an orphaned subscription with no
    // tenant.subscriptionId pointing to it.
    const session = await mongoose.startSession();
    let subscription;
    try {
      session.startTransaction();
      [subscription] = await Subscription.create([subscriptionData], { session });
      await Tenant.findByIdAndUpdate(tenantId, { subscriptionId: subscription._id }, { session });
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'subscription',
      entityId: subscription._id.toString(),
      changes: {
        planId: planId,
        status: subscription.status,
        billingCycle,
        isTrial
      },
    });

    const populatedSubscription = await Subscription.findById(subscription._id)
      .populate('tenantId', 'slug name')
      .populate('planId', 'name tier price features birCompliance isCustom');

    return NextResponse.json({
      success: true,
      data: populatedSubscription
    }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      const t = await getValidationTranslatorFromRequest(request);
      return NextResponse.json(
        { success: false, error: t('validation.tenantAlreadyHasSubscription', 'Tenant already has a subscription') },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}