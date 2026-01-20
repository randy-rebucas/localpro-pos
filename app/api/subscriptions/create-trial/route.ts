import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { tenantSlug } = body;

    if (!tenantSlug) {
      return NextResponse.json(
        { success: false, error: 'Tenant slug is required' },
        { status: 400 }
      );
    }

    // Find the tenant by slug
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const tenantId = tenant._id.toString();

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
        currentUsers: 1, // Admin user
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

  } catch (error: any) {
    console.error('Error creating trial subscription:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}