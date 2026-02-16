import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { requireRole } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Require admin role to list subscriptions
    await requireRole(request, ['admin']);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // tenantId is never user-supplied to prevent IDOR
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }

    const subscriptions = await Subscription.find(query)
      .populate('tenantId', 'slug name')
      .populate('planId', 'name tier price features')
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
    return NextResponse.json({ success: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Only admins can create subscriptions (tenants cannot create their own subscriptions)
    await requireRole(request, ['admin']);

    const body = await request.json();
    const { tenantId, planId, billingCycle = 'monthly', isTrial = false } = body;

    if (!tenantId || !planId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID and Plan ID are required' },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
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
        { success: false, error: 'Tenant already has an active subscription' },
        { status: 400 }
      );
    }

    // Verify plan exists and is active
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found or inactive' },
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

    const subscription = await Subscription.create(subscriptionData);

    // Update tenant with subscription reference
    await Tenant.findByIdAndUpdate(tenantId, {
      subscriptionId: subscription._id
    });

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
      .populate('planId', 'name tier price features');

    return NextResponse.json({
      success: true,
      data: populatedSubscription
    }, { status: 201 });
  } catch (error: unknown) {
    if ((error as Record<string, unknown>).code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Tenant already has a subscription' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 400 });
  }
}