import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import SubscriptionPlan from '@/models/SubscriptionPlan';
import Tenant from '@/models/Tenant';
import BillingEvent from '@/models/BillingEvent';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { capturePayment } from '@/lib/paypal';
import { validateCoupon, applyCouponDiscount, incrementCouponUsage, CouponError } from '@/lib/coupons';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const t = await getValidationTranslatorFromRequest(request);

    // Require authentication
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { planId, billingCycle = 'monthly', paypalOrderId, couponCode } = body;

    if (!planId) {
      return NextResponse.json(
        { success: false, error: t('validation.planIdRequired', 'Plan ID is required') },
        { status: 400 }
      );
    }

    // Verify PayPal payment before activating subscription
    if (!paypalOrderId) {
      return NextResponse.json(
        { success: false, error: t('validation.paypalOrderIdRequired', 'PayPal order ID is required') },
        { status: 400 }
      );
    }

    // Idempotency short-circuit: if this order was already captured and recorded
    // (e.g. the client retried after a dropped response on a prior successful
    // activation), don't re-attempt the PayPal capture — PayPal will reject a
    // second capture of the same order and the tenant would wrongly see
    // "Activation Failed" even though they're already upgraded.
    const alreadyProcessed = await BillingEvent.findOne({ tenantId, transactionId: paypalOrderId }).lean();
    if (alreadyProcessed) {
      const subscription = await Subscription.findById(alreadyProcessed.subscriptionId).lean();
      return NextResponse.json({
        success: true,
        message: t('subscription.alreadyActivated', 'Subscription activated successfully'),
        data: subscription,
      });
    }

    // Get the subscription plan
    const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionPlanNotFound', 'Subscription plan not found') },
        { status: 404 }
      );
    }

    let expectedAmount = billingCycle === 'yearly'
      ? plan.price.monthly * 12 * 0.9
      : plan.price.monthly;

    // Re-validate the coupon server-side rather than trusting the discounted
    // amount the client remembers from create-payment — the client only
    // dictates which coupon was used, not how much discount it's worth.
    let coupon: Awaited<ReturnType<typeof validateCoupon>> | null = null;
    if (couponCode) {
      try {
        coupon = await validateCoupon(couponCode, planId);
        expectedAmount = applyCouponDiscount(expectedAmount, coupon);
      } catch (e) {
        if (e instanceof CouponError) {
          return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }
        throw e;
      }
    }

    let captureResult;
    try {
      captureResult = await capturePayment(paypalOrderId);
    } catch {
      return NextResponse.json(
        { success: false, error: t('validation.paypalVerificationFailed', 'Failed to verify PayPal payment. Please try again.') },
        { status: 402 }
      );
    }

    if (captureResult.status !== 'COMPLETED') {
      return NextResponse.json(
        { success: false, error: t('validation.paymentNotCompleted', `Payment not completed. Status: ${captureResult.status}`) },
        { status: 402 }
      );
    }

    // Verify the amount actually captured by PayPal matches the plan being activated —
    // the client picks planId independently of the PayPal order, so this must be checked
    // server-side or a tenant could pay for a cheap plan and activate an expensive one.
    const capturedAmountStr = captureResult.purchaseUnits?.[0]?.payments?.captures?.[0]?.amount?.value;
    const capturedCurrency = captureResult.purchaseUnits?.[0]?.payments?.captures?.[0]?.amount?.currencyCode;
    const capturedAmount = capturedAmountStr ? parseFloat(capturedAmountStr) : NaN;

    if (
      !Number.isFinite(capturedAmount) ||
      Math.abs(capturedAmount - expectedAmount) > 0.01 ||
      capturedCurrency !== plan.price.currency
    ) {
      logger.error('PayPal captured amount does not match plan price', {
        tenantId, planId, billingCycle, capturedAmount, capturedCurrency, expectedAmount, expectedCurrency: plan.price.currency,
      });
      return NextResponse.json(
        { success: false, error: t('validation.paymentAmountMismatch', 'Payment amount does not match the selected plan.') },
        { status: 402 }
      );
    }

    const now = new Date();
    let subscriptionData: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const nextBillingDate = new Date(now);
    if (billingCycle === 'yearly') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
    const endDate = nextBillingDate;

    const billingEntry = {
      date: now,
      amount: expectedAmount,
      currency: plan.price.currency,
      status: 'paid',
      transactionId: paypalOrderId || undefined,
    };

    // Money has already been captured by PayPal at this point — the remaining
    // writes (subscription, tenant backref, billing event) must all land together
    // or not at all, otherwise a tenant can end up charged with no matching
    // subscription/billing record.
    const session = await mongoose.startSession();
    let subscriptionId: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let wasTrial = false;
    try {
      session.startTransaction();

      const existingSubscription = await Subscription.findOne({ tenantId }).session(session);
      wasTrial = existingSubscription?.isTrial === true;

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

        await Subscription.findByIdAndUpdate(existingSubscription._id, subscriptionData, { session });
        subscriptionId = existingSubscription._id;
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

        const [subscription] = await Subscription.create([subscriptionData], { session });
        subscriptionId = subscription._id;

        // Update tenant with subscription reference
        await Tenant.findByIdAndUpdate(tenantId, { subscriptionId: subscription._id }, { session });
      }

      await BillingEvent.create(
        [
          {
            tenantId,
            subscriptionId,
            type: wasTrial ? 'trial_converted' : 'plan_changed',
            amount: expectedAmount,
            currency: plan.price.currency,
            description: wasTrial
              ? `Trial converted to ${plan.name} (${billingCycle}) via PayPal${coupon ? ` (coupon ${coupon.code})` : ''}`
              : `Plan activated/changed to ${plan.name} (${billingCycle}) via PayPal${coupon ? ` (coupon ${coupon.code})` : ''}`,
            transactionId: paypalOrderId,
          },
        ],
        { session }
      );

      // Reserve the coupon's use in the same transaction as the charge it
      // discounted — if the payment write rolls back, the use shouldn't be
      // consumed either.
      if (coupon) {
        await incrementCouponUsage(coupon._id, session);
      }

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      // A duplicate-key error on the transactionId index means a concurrent
      // request already recorded this exact payment — treat as already activated
      // rather than surfacing a false failure.
      if (e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000) {
        const existing = await BillingEvent.findOne({ tenantId, transactionId: paypalOrderId }).lean();
        if (existing) {
          const subscription = await Subscription.findById(existing.subscriptionId).lean();
          return NextResponse.json({
            success: true,
            message: t('subscription.alreadyActivated', 'Subscription activated successfully'),
            data: subscription,
          });
        }
      }
      throw e;
    } finally {
      session.endSession();
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.SUBSCRIPTION_ACTIVATE,
      entityType: 'subscription',
      entityId: subscriptionId.toString(),
      changes: {
        planId: plan._id.toString(),
        billingCycle,
        amount: expectedAmount,
        currency: plan.price.currency,
        wasTrial,
        paypalOrderId,
        couponCode: coupon?.code,
      },
    });

    return NextResponse.json({
      success: true,
      message: t('subscription.activated', 'Subscription activated successfully'),
      data: subscriptionData,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error activating subscription:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.subscriptionActivationFailed', 'Failed to activate subscription') },
      { status: 500 }
    );
  }
}