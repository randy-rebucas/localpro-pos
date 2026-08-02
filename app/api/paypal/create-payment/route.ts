import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getTenantSlugFromRequest } from '@/lib/api-tenant';
import { createSubscriptionPayment } from '@/lib/paypal';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(request); // eslint-disable-line @typescript-eslint/no-unused-vars
    const tenantId = await getTenantIdFromRequest(request);
    const tenantSlug = await getTenantSlugFromRequest(request);

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

    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    const priceMonthly = Number(plan.priceMonthly);
    // Calculate amount based on billing cycle
    const amount = billingCycle === 'yearly'
      ? priceMonthly * 12 * 0.9 // 10% discount for yearly
      : priceMonthly;

    // Create PayPal payment order
    const paypalOrder = await createSubscriptionPayment(planId, amount, plan.priceCurrency, tenantSlug, 'en', billingCycle);

    return NextResponse.json({
      success: true,
      data: {
        orderId: paypalOrder.id,
        paypalOrder,
        planId,
        amount,
        currency: plan.priceCurrency,
        billingCycle,
      },
    });

  } catch (error: unknown) {
    logger.error('Error creating PayPal payment:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to create payment' },
      { status: 500 }
    );
  }
}
