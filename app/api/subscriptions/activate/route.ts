import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication
    const user = await requireAuth(request); // eslint-disable-line @typescript-eslint/no-unused-vars
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { planId, billingCycle = 'monthly', paypalOrderId } = body; // eslint-disable-line @typescript-eslint/no-unused-vars

    if (!planId) {
      return NextResponse.json(
        { success: false, error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Get the subscription plan
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    // Check if tenant already has an active subscription
    const existingSubscription = await Subscription.findOne({
      tenantId,
      status: { $in: ['active', 'trial'] }
    });

    const now = new Date();
    let subscriptionData: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (existingSubscription) {
      // Update existing subscription
      const endDate = billingCycle === 'yearly'
        ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      subscriptionData = {
        planId: plan._id,
        status: 'active',
        billingCycle,
        endDate,
        isTrial: false,
        autoRenew: true,
        updatedAt: now,
      };

      // Add billing history entry
      subscriptionData.$push = {
        billingHistory: {
          amount: billingCycle === 'yearly' ? plan.price.monthly * 12 * 0.9 : plan.price.monthly,
          currency: plan.price.currency,
          status: 'paid',
          billingCycle,
          periodStart: now,
          periodEnd: endDate,
          createdAt: now,
          description: `Subscription ${billingCycle === 'yearly' ? 'yearly' : 'monthly'} payment`,
        }
      };

      await Subscription.findByIdAndUpdate(existingSubscription._id, subscriptionData);
    } else {
      // Create new subscription
      const endDate = billingCycle === 'yearly'
        ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      subscriptionData = {
        tenantId,
        planId: plan._id,
        status: 'active',
        billingCycle,
        startDate: now,
        endDate,
        isTrial: false,
        autoRenew: true,
        usage: {
          currentUsers: 1, // Admin user
          currentBranches: 1,
          currentProducts: 0,
          currentTransactions: 0,
          lastResetDate: now,
        },
        billingHistory: [{
          amount: billingCycle === 'yearly' ? plan.price.monthly * 12 * 0.9 : plan.price.monthly,
          currency: plan.price.currency,
          status: 'paid',
          billingCycle,
          periodStart: now,
          periodEnd: endDate,
          createdAt: now,
          description: `Initial subscription ${billingCycle === 'yearly' ? 'yearly' : 'monthly'} payment`,
        }],
      };

      const subscription = await Subscription.create(subscriptionData);

      // Update tenant with subscription reference
      await Tenant.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      data: subscriptionData,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error activating subscription:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}