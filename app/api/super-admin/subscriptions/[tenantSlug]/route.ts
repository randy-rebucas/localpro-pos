import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { getTenantBySlugAny } from '@/lib/data/tenants';

function serializeSubscription(sub: Record<string, unknown> & {
  id: string;
  outstandingBalance: unknown;
  plan?: Record<string, unknown> | null;
}) {
  const { id, outstandingBalance, plan, ...rest } = sub;
  const serialized: Record<string, unknown> = {
    _id: id,
    ...rest,
    outstandingBalance: Number(outstandingBalance),
  };
  if (plan) {
    const { id: planId, priceMonthly, priceSetupFee, priceCurrency, reactivationFee, yearlyDiscount, ...planRest } =
      plan as Record<string, unknown> & { id: string; priceMonthly?: unknown; priceSetupFee?: unknown; priceCurrency?: string; reactivationFee?: unknown; yearlyDiscount?: unknown };
    serialized.planId = {
      _id: planId,
      ...planRest,
      ...(priceMonthly !== undefined
        ? {
            price: {
              monthly: Number(priceMonthly),
              setupFee: Number(priceSetupFee),
              currency: priceCurrency,
            },
          }
        : {}),
      ...(reactivationFee !== undefined ? { reactivationFee: Number(reactivationFee) } : {}),
      ...(yearlyDiscount !== undefined ? { yearlyDiscount: Number(yearlyDiscount) } : {}),
    };
  }
  return serialized;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await getTenantBySlugAny(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      include: {
        plan: {
          select: { name: true, tier: true, priceMonthly: true, priceSetupFee: true, priceCurrency: true, features: true, id: true },
        },
      },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeSubscription(subscription) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await getTenantBySlugAny(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    const tenantId = tenant.id;
    const subscriptionId = subscription.id;
    const previousStatus = subscription.status;

    switch (action) {
      case 'assign-plan': {
        const { planId } = body;
        if (!planId) {
          return NextResponse.json({ success: false, error: 'planId is required' }, { status: 400 });
        }
        const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
        if (!plan) {
          return NextResponse.json({ success: false, error: 'Plan not found' }, { status: 404 });
        }
        const previousPlanId = subscription.planId;
        const now = new Date();
        let nextBilling: Date;
        if (body.nextBillingDate) {
          nextBilling = new Date(body.nextBillingDate as string);
          if (isNaN(nextBilling.getTime())) {
            return NextResponse.json({ success: false, error: 'Invalid nextBillingDate' }, { status: 400 });
          }
        } else {
          nextBilling = new Date(now);
          if (subscription.billingCycle === 'yearly') {
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          } else {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
          }
        }
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            planId,
            status: 'active',
            isTrial: false,
            startDate: now,
            nextBillingDate: nextBilling,
            trialEndDate: null,
            endDate: null,
            cancelledAt: null,
            suspendedAt: null,
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.assign_plan',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: {
            planId: { from: previousPlanId, to: planId },
            status: { from: previousStatus, to: 'active' },
            isTrial: { from: true, to: false },
            startDate: now,
          },
        });
        break;
      }
      case 'extend-trial': {
        const days = parseInt(body.days) || 0;
        if (days <= 0) {
          return NextResponse.json({ success: false, error: 'days must be a positive integer' }, { status: 400 });
        }
        const base = subscription.trialEndDate && subscription.trialEndDate > new Date()
          ? subscription.trialEndDate
          : new Date();
        const newTrialEndDate = new Date(base.getTime() + days * 86_400_000);
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            trialEndDate: newTrialEndDate,
            nextBillingDate: newTrialEndDate,
            ...(subscription.status !== 'trial' ? { status: 'trial' } : {}),
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.extend_trial',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { trialEndDate: newTrialEndDate, days },
        });
        break;
      }
      case 'cancel': {
        const { reason: cancelReason } = body;
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'cancelled',
            cancelledAt: new Date(),
            ...(cancelReason ? { cancellationReason: cancelReason } : {}),
          },
        });
        await prisma.billingEvent.create({
          data: {
            tenantId,
            subscriptionId,
            type: 'subscription_cancelled',
            amount: 0,
            currency: 'PHP',
            description: cancelReason || 'Cancelled by super-admin',
            recordedBy: adminUser.userId,
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.cancel',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { status: { from: previousStatus, to: 'cancelled' }, reason: cancelReason },
        });
        break;
      }
      case 'activate': {
        if (Number(subscription.outstandingBalance || 0) > 0) {
          return NextResponse.json(
            { success: false, error: `Outstanding balance of ${subscription.outstandingBalance} must be settled (via record-payment) before reactivating` },
            { status: 400 }
          );
        }
        const wasTrial = subscription.isTrial;
        const wasDeactivated = !!subscription.deactivatedAt;
        const nextBilling = new Date();
        if (subscription.billingCycle === 'yearly') {
          nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        } else {
          nextBilling.setMonth(nextBilling.getMonth() + 1);
        }
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'active',
            isTrial: false,
            ...(wasTrial && !subscription.trialConvertedAt ? { trialConvertedAt: new Date() } : {}),
            nextBillingDate: nextBilling,
            gracePeriodEndDate: null,
            paymentOverdue: false,
            deactivatedAt: null,
            lateFeeAppliedAt: null,
            reactivationFeeAppliedAt: null,
          },
        });
        if (wasDeactivated) {
          await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
          await prisma.billingEvent.create({
            data: {
              tenantId,
              subscriptionId,
              type: 'account_reactivated',
              amount: 0,
              currency: 'PHP',
              description: 'Account reactivated by super-admin after outstanding balance settled',
              recordedBy: adminUser.userId,
            },
          });
        }
        if (wasTrial) {
          await prisma.billingEvent.create({
            data: {
              tenantId,
              subscriptionId,
              type: 'trial_converted',
              amount: 0,
              currency: 'PHP',
              description: 'Trial converted to active subscription by super-admin',
              recordedBy: adminUser.userId,
            },
          });
        }
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.activate',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { status: { from: previousStatus, to: 'active' } },
        });
        break;
      }
      case 'suspend': {
        const { graceDays } = body;
        let gracePeriodEndDate: Date | undefined;
        if (graceDays && Number(graceDays) > 0) {
          gracePeriodEndDate = new Date();
          gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + Number(graceDays));
        }
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'suspended',
            suspendedAt: new Date(),
            ...(gracePeriodEndDate ? { gracePeriodEndDate } : {}),
          },
        });
        await prisma.billingEvent.create({
          data: {
            tenantId,
            subscriptionId,
            type: 'subscription_suspended',
            amount: 0,
            currency: 'PHP',
            description: `Suspended by super-admin${graceDays ? ` (grace period: ${graceDays} days)` : ''}`,
            recordedBy: adminUser.userId,
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.suspend',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { status: { from: previousStatus, to: 'suspended' } },
        });
        break;
      }
      case 'pause': {
        const { pauseReason, pauseDays } = body;
        let pauseEndsAt: Date | undefined;
        if (pauseDays && Number(pauseDays) > 0) {
          pauseEndsAt = new Date();
          pauseEndsAt.setDate(pauseEndsAt.getDate() + Number(pauseDays));
        }
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'paused',
            pausedAt: new Date(),
            ...(pauseReason ? { pauseReason } : {}),
            ...(pauseEndsAt ? { pauseEndsAt } : {}),
          },
        });
        await prisma.billingEvent.create({
          data: {
            tenantId,
            subscriptionId,
            type: 'subscription_paused',
            amount: 0,
            currency: 'PHP',
            description: pauseReason || 'Paused by super-admin',
            recordedBy: adminUser.userId,
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.pause',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { status: { from: previousStatus, to: 'paused' }, pauseReason },
        });
        break;
      }
      case 'resume': {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: 'active',
            pausedAt: null,
            pauseReason: null,
            pauseEndsAt: null,
          },
        });
        await prisma.billingEvent.create({
          data: {
            tenantId,
            subscriptionId,
            type: 'subscription_resumed',
            amount: 0,
            currency: 'PHP',
            description: 'Resumed by super-admin',
            recordedBy: adminUser.userId,
          },
        });
        await createAuditLog(request, {
          tenantId,
          userId: adminUser.userId,
          action: 'subscription.resume',
          entityType: 'Subscription',
          entityId: subscriptionId,
          changes: { status: { from: previousStatus, to: 'active' } },
        });
        break;
      }
      case 'record-payment': {
        const { amount: payAmount, notes: payNotes, transactionId: payTxId } = body;
        if (!payAmount || Number(payAmount) <= 0) {
          return NextResponse.json({ success: false, error: 'amount must be a positive number' }, { status: 400 });
        }
        await prisma.billingEvent.create({
          data: {
            tenantId,
            subscriptionId,
            type: 'payment_received',
            amount: Number(payAmount),
            currency: 'PHP',
            description: payNotes || 'Manual payment recorded by super-admin',
            notes: payNotes,
            transactionId: payTxId,
            recordedBy: adminUser.userId,
          },
        });
        await prisma.subscriptionBillingHistoryEntry.create({
          data: {
            subscriptionId,
            date: new Date(),
            amount: Number(payAmount),
            currency: 'PHP',
            status: 'paid',
            transactionId: payTxId,
          },
        });

        const newOutstandingBalance = Math.max(0, Number(subscription.outstandingBalance || 0) - Number(payAmount));
        const wasDeactivated = !!subscription.deactivatedAt || subscription.status === 'suspended';
        const fullyPaid = newOutstandingBalance <= 0;
        const wasOverdue = subscription.paymentOverdue;

        const updateData: Record<string, unknown> = { outstandingBalance: newOutstandingBalance };

        if (fullyPaid && (wasOverdue || wasDeactivated)) {
          const nextBilling = new Date();
          if (subscription.billingCycle === 'yearly') {
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          } else {
            nextBilling.setMonth(nextBilling.getMonth() + 1);
          }
          updateData.nextBillingDate = nextBilling;
          updateData.paymentOverdue = false;
          updateData.gracePeriodEndDate = null;
          updateData.deactivatedAt = null;
          updateData.lateFeeAppliedAt = null;
          updateData.reactivationFeeAppliedAt = null;

          if (wasDeactivated) {
            updateData.status = 'active';
          }
        }

        await prisma.subscription.update({ where: { id: subscriptionId }, data: updateData });

        if (fullyPaid && wasDeactivated) {
          await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
          await prisma.billingEvent.create({
            data: {
              tenantId,
              subscriptionId,
              type: 'account_reactivated',
              amount: 0,
              currency: 'PHP',
              description: 'Account reactivated automatically after payment settled outstanding balance',
              recordedBy: adminUser.userId,
            },
          });
        }
        break;
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await prisma.superAdminAction.create({
      data: {
        adminUserId: adminUser.userId,
        action: `subscription.${action}`,
        targetType: 'Subscription',
        targetId: subscriptionId,
        description: `Action "${action}" on subscription for tenant ${tenantSlug}`,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    const updated = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: {
          select: { name: true, tier: true, priceMonthly: true, priceSetupFee: true, priceCurrency: true, id: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated ? serializeSubscription(updated) : null });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.message === 'Unauthorized' ? 401 : 403 }
      );
    }
    return handleApiError(error);
  }
}
