import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { capturePayment } from '@/lib/paypal';

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
    const { planId, billingCycle = 'monthly', paypalOrderId } = body;

    if (!planId) {
      return NextResponse.json(
        { success: false, error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Verify PayPal payment before activating subscription
    if (!paypalOrderId) {
      return NextResponse.json(
        { success: false, error: 'PayPal order ID is required' },
        { status: 400 }
      );
    }

    let captureResult;
    try {
      captureResult = await capturePayment(paypalOrderId);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to verify PayPal payment. Please try again.' },
        { status: 402 }
      );
    }

    if (captureResult.status !== 'COMPLETED') {
      return NextResponse.json(
        { success: false, error: `Payment not completed. Status: ${captureResult.status}` },
        { status: 402 }
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

    // Find any existing subscription for this tenant (any status)
    const existingSubscription = await Subscription.findOne({ tenantId });

    const now = new Date();
    let subscriptionData: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const endDate = billingCycle === 'yearly'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const billingEntry = {
      date: now,
      amount: billingCycle === 'yearly' ? plan.price.monthly * 12 * 0.9 : plan.price.monthly,
      currency: plan.price.currency,
      status: 'paid',
      transactionId: paypalOrderId || undefined,
    };

    if (existingSubscription) {
      // Update existing subscription (upgrade, re-activate, or trial conversion)
      subscriptionData = {
        planId: plan._id,
        status: 'active',
        billingCycle,
        endDate,
        nextBillingDate: endDate,
        isTrial: false,
        autoRenew: true,
        $push: { billingHistory: billingEntry },
      };

      await Subscription.findByIdAndUpdate(existingSubscription._id, subscriptionData);
    } else {
      // Create brand-new subscription
      subscriptionData = {
        tenantId,
        planId: plan._id,
        status: 'active',
        billingCycle,
        startDate: now,
        endDate,
        nextBillingDate: endDate,
        isTrial: false,
        autoRenew: true,
        usage: {
          currentUsers: 1, // Admin user
          currentBranches: 1,
          currentProducts: 0,
          currentTransactions: 0,
          lastResetDate: now,
        },
        billingHistory: [billingEntry],
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