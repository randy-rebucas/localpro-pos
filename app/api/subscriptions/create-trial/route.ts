import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication to create a trial
    const user = await requireAuth(request);
    const tenantId = user.tenantId;

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

    // Find the starter plan
    const starterPlan = await SubscriptionPlan.findOne({ tier: 'starter', isActive: true });
    if (!starterPlan) {
      return NextResponse.json(
        { success: false, error: 'Starter plan not available' },
        { status: 404 }
      );
    }

    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

    const subscriptionData = {
      tenantId,
      planId: starterPlan._id,
      status: 'trial',
      billingCycle: 'monthly',
      startDate: now,
      trialEndDate,
      nextBillingDate: trialEndDate,
      isTrial: true,
      autoRenew: true,
      usage: {
        currentUsers: 1,
        currentBranches: 1,
        currentProducts: 0,
        currentTransactions: 0,
        lastResetDate: now,
      },
    };

    const subscription = await Subscription.create(subscriptionData);

    // Update tenant with subscription reference
    await Tenant.findByIdAndUpdate(tenantId, {
      subscriptionId: subscription._id
    });

    return NextResponse.json({
      success: true,
      data: subscription,
      message: '14-day trial subscription created successfully'
    }, { status: 201 });

  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    console.error('Error creating trial subscription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trial subscription' },
      { status: 500 }
    );
  }
}
