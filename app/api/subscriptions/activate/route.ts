import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { capturePayment } from '@/lib/paypal';
import { logger } from '@/lib/logger';
import { runInTransaction } from '@/lib/db-transaction';
import { getSubscriptionByTenantId } from '@/lib/data/subscriptions';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
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
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Subscription plan not found' },
        { status: 404 }
      );
    }

    // Find any existing subscription for this tenant (any status)
    const existingSubscription = await getSubscriptionByTenantId(tenantId);

    const now = new Date();

    const nextBillingDate = new Date(now);
    if (billingCycle === 'yearly') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
    const endDate = nextBillingDate;

    const priceMonthly = Number(plan.priceMonthly);
    const billingAmount = billingCycle === 'yearly' ? priceMonthly * 12 * 0.9 : priceMonthly;

    let resultSubscription;

    if (existingSubscription) {
      resultSubscription = await runInTransaction(async (tx) => {
        const updated = await tx.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            planId: plan.id,
            status: 'active',
            billingCycle,
            endDate,
            nextBillingDate: endDate,
            isTrial: false,
            autoRenew: true,
          },
        });
        await tx.subscriptionBillingHistoryEntry.create({
          data: {
            subscriptionId: updated.id,
            date: now,
            amount: billingAmount,
            currency: plan.priceCurrency,
            status: 'paid',
            transactionId: paypalOrderId || null,
          },
        });
        return updated;
      });
    } else {
      resultSubscription = await runInTransaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            tenantId,
            planId: plan.id,
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
          },
        });
        await tx.subscriptionBillingHistoryEntry.create({
          data: {
            subscriptionId: created.id,
            date: now,
            amount: billingAmount,
            currency: plan.priceCurrency,
            status: 'paid',
            transactionId: paypalOrderId || null,
          },
        });
        return created;
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully',
      data: { _id: resultSubscription.id, ...resultSubscription },
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error activating subscription:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
