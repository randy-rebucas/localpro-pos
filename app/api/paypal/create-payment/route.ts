import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { createSubscriptionPayment } from '@/lib/paypal';

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Require authentication
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { planId, billingCycle = 'monthly' } = body;

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

    // Calculate amount based on billing cycle
    const amount = billingCycle === 'yearly'
      ? plan.price.monthly * 12 * 0.9 // 10% discount for yearly
      : plan.price.monthly;

    // Create PayPal payment order
    const paypalOrder = await createSubscriptionPayment(planId, amount, plan.price.currency);

    return NextResponse.json({
      success: true,
      data: {
        orderId: paypalOrder.id,
        paypalOrder,
        planId,
        amount,
        currency: plan.price.currency,
        billingCycle,
      },
    });

  } catch (error: any) {
    console.error('Error creating PayPal payment:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create payment' },
      { status: 500 }
    );
  }
}