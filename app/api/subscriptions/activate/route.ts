import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { capturePayment } from '@/lib/paypal';
import { validateCoupon, applyCouponDiscount, incrementCouponUsage, CouponError } from '@/lib/coupons';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  try {
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

    if (!(await hasTenantPermission(user.role, tenantId, 'subscriptions.manage'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
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
    // tenantId scoped: BillingEvent has a unique [tenantId, transactionId]
    // constraint, and the lookup below is filtered on both, matching the
    // documented cross-tenant-leak fix for subscription endpoints.
    const alreadyProcessed = await prisma.billingEvent.findFirst({
      where: { tenantId, transactionId: paypalOrderId },
    });
    if (alreadyProcessed) {
      const subscription = await prisma.subscription.findUnique({
        where: { id: alreadyProcessed.subscriptionId },
      });
      return NextResponse.json({
        success: true,
        message: t('subscription.alreadyActivated', 'Subscription activated successfully'),
        data: subscription,
      });
    }

    // Get the subscription plan (global catalog — not tenant scoped)
    const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) {
      return NextResponse.json(
        { success: false, error: t('validation.subscriptionPlanNotFound', 'Subscription plan not found') },
        { status: 404 }
      );
    }

    let expectedAmount = billingCycle === 'yearly'
      ? Number(plan.priceMonthly) * 12 * 0.9
      : Number(plan.priceMonthly);

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
      capturedCurrency !== plan.priceCurrency
    ) {
      logger.error('PayPal captured amount does not match plan price', {
        tenantId, planId, billingCycle, capturedAmount, capturedCurrency, expectedAmount, expectedCurrency: plan.priceCurrency,
      });
      return NextResponse.json(
        { success: false, error: t('validation.paymentAmountMismatch', 'Payment amount does not match the selected plan.') },
        { status: 402 }
      );
    }

    const now = new Date();

    const nextBillingDate = new Date(now);
    if (billingCycle === 'yearly') {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
    const endDate = nextBillingDate;

    // Money has already been captured by PayPal at this point — the remaining
    // writes (subscription, billing history, billing event) must all land together
    // or not at all, otherwise a tenant can end up charged with no matching
    // subscription/billing record. All queries below are scoped by tenantId to
    // avoid the previously-documented cross-tenant subscription leak.
    let subscriptionId: string;
    let wasTrial = false;
    let resultSubscription;
    try {
      resultSubscription = await prisma.$transaction(async (tx) => {
        const existingSubscription = await tx.subscription.findUnique({ where: { tenantId } });
        wasTrial = existingSubscription?.isTrial === true;

        let subscription;
        if (existingSubscription) {
          // Update existing subscription (upgrade, re-activate, or trial conversion)
          subscription = await tx.subscription.update({
            where: { id: existingSubscription.id },
            data: {
              planId: plan.id,
              status: 'active',
              billingCycle,
              endDate,
              nextBillingDate: endDate,
              isTrial: false,
              autoRenew: true,
              billingHistory: {
                create: {
                  id: randomUUID(),
                  date: now,
                  amount: expectedAmount,
                  currency: plan.priceCurrency,
                  status: 'paid',
                  transactionId: paypalOrderId || undefined,
                },
              },
            },
          });
          subscriptionId = existingSubscription.id;
        } else {
          // Create brand-new subscription
          subscription = await tx.subscription.create({
            data: {
              id: randomUUID(),
              tenantId,
              planId: plan.id,
              status: 'active',
              billingCycle,
              startDate: now,
              endDate,
              nextBillingDate: endDate,
              isTrial: false,
              autoRenew: true,
              usageCurrentUsers: 1,
              usageCurrentBranches: 1,
              usageCurrentProducts: 0,
              usageCurrentTransactions: 0,
              usageLastResetDate: now,
              billingHistory: {
                create: {
                  id: randomUUID(),
                  date: now,
                  amount: expectedAmount,
                  currency: plan.priceCurrency,
                  status: 'paid',
                  transactionId: paypalOrderId || undefined,
                },
              },
            },
          });
          subscriptionId = subscription.id;
        }

        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId,
            subscriptionId,
            type: wasTrial ? 'trial_converted' : 'plan_changed',
            amount: expectedAmount,
            currency: plan.priceCurrency,
            description: wasTrial
              ? `Trial converted to ${plan.name} (${billingCycle}) via PayPal${coupon ? ` (coupon ${coupon.code})` : ''}`
              : `Plan activated/changed to ${plan.name} (${billingCycle}) via PayPal${coupon ? ` (coupon ${coupon.code})` : ''}`,
            transactionId: paypalOrderId,
          },
        });

        // Reserve the coupon's use in the same transaction as the charge it
        // discounted — if the payment write rolls back, the use shouldn't be
        // consumed either.
        // TODO(postgres-migration): lib/coupons.ts is still Mongoose-based
        // (owned by the customers/crm/loyalty/coupons migration workstream)
        // and incrementCouponUsage expects a mongoose.ClientSession, not a
        // Prisma transaction client — it cannot participate in this Prisma
        // $transaction. Left as a best-effort call outside strict atomicity
        // until lib/coupons.ts is migrated to Prisma; revisit then to move
        // this inside the transaction against the Prisma tx client.
        if (coupon) {
          await incrementCouponUsage(coupon._id, undefined as unknown as Parameters<typeof incrementCouponUsage>[1]);
        }

        return subscription;
      });
    } catch (e) {
      // A duplicate-key error on the [tenantId, transactionId] index means a
      // concurrent request already recorded this exact payment — treat as
      // already activated rather than surfacing a false failure.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await prisma.billingEvent.findFirst({ where: { tenantId, transactionId: paypalOrderId } });
        if (existing) {
          const subscription = await prisma.subscription.findUnique({ where: { id: existing.subscriptionId } });
          return NextResponse.json({
            success: true,
            message: t('subscription.alreadyActivated', 'Subscription activated successfully'),
            data: subscription,
          });
        }
      }
      throw e;
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.SUBSCRIPTION_ACTIVATE,
      entityType: 'subscription',
      entityId: resultSubscription.id,
      changes: {
        planId: plan.id,
        billingCycle,
        amount: expectedAmount,
        currency: plan.priceCurrency,
        wasTrial,
        paypalOrderId,
        couponCode: coupon?.code,
      },
    });

    return NextResponse.json({
      success: true,
      message: t('subscription.activated', 'Subscription activated successfully'),
      data: resultSubscription,
    });

  } catch (error: unknown) {
    logger.error('Error activating subscription:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: (error as Error).message || t('validation.subscriptionActivationFailed', 'Failed to activate subscription') },
      { status: 500 }
    );
  }
}
