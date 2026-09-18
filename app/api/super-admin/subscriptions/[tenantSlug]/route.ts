import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { Prisma, Subscription } from '@prisma/client';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { createAuditLog } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

type TxClient = Prisma.TransactionClient;

async function resolveTenant(slug: string) {
  return prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: tenant.id },
      include: { plan: { select: { name: true, tier: true, priceMonthly: true, priceSetupFee: true, priceCurrency: true } } },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'No subscription found for this tenant' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: subscription });
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

// A validation failure here (missing field, plan not found, invalid date, positive-amount
// check) surfaces as { error } and must be resolved *before* the transaction opens below —
// nothing here reads/writes with a transaction.
async function validateAction(action: string, body: Record<string, unknown>, subscription: Subscription): Promise<{ error: string; status: number } | null> {
  switch (action) {
    case 'assign-plan': {
      if (!body.planId) return { error: 'planId is required', status: 400 };
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: body.planId as string } });
      if (!plan) return { error: 'Plan not found', status: 404 };
      if (body.nextBillingDate && isNaN(new Date(body.nextBillingDate as string).getTime())) {
        return { error: 'Invalid nextBillingDate', status: 400 };
      }
      return null;
    }
    case 'extend-trial': {
      const days = parseInt(body.days as string) || 0;
      if (days <= 0) return { error: 'days must be a positive integer', status: 400 };
      return null;
    }
    case 'activate': {
      const outstandingBalance = Number(subscription.outstandingBalance || 0);
      if (outstandingBalance > 0) {
        return { error: `Outstanding balance of ${outstandingBalance} must be settled (via record-payment) before reactivating`, status: 400 };
      }
      // Reactivating a cancelled subscription is a deliberate win-back, not a
      // routine unpause/unsuspend — require the admin to record why.
      if (subscription.status === 'cancelled' && !(body.reactivationReason as string | undefined)?.trim()) {
        return { error: 'reactivationReason is required to reactivate a cancelled subscription', status: 400 };
      }
      return null;
    }
    case 'record-payment': {
      if (!body.amount || Number(body.amount) <= 0) return { error: 'amount must be a positive number', status: 400 };
      return null;
    }
    case 'cancel':
    case 'suspend':
    case 'pause':
    case 'resume':
      return null;
    default:
      return { error: `Unknown action: ${action}`, status: 400 };
  }
}

interface AuditPlan { changes: Record<string, unknown> }

// Applies the mutation for `action` against `subscription` (and, for a few actions, the
// tenant's isActive flag + a BillingEvent) inside the caller's transaction. Returns
// the audit-log changes payload for the caller to log once the transaction has committed.
async function applyAction(
  action: string,
  body: Record<string, unknown>,
  subscription: Subscription,
  tenantId: string,
  adminUserId: string,
  previousStatus: string,
  tx: TxClient
): Promise<AuditPlan> {
  switch (action) {
    case 'assign-plan': {
      const planId = body.planId as string;
      const previousPlanId = subscription.planId;
      const now = new Date();
      let nextBilling: Date;
      if (body.nextBillingDate) {
        nextBilling = new Date(body.nextBillingDate as string);
      } else {
        nextBilling = new Date(now);
        if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setMonth(nextBilling.getMonth() + 1);
      }
      await tx.subscription.update({
        where: { id: subscription.id },
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
      return {
        changes: {
          planId: { from: previousPlanId, to: planId },
          status: { from: previousStatus, to: 'active' },
          isTrial: { from: true, to: false },
          startDate: now,
        },
      };
    }
    case 'extend-trial': {
      const days = parseInt(body.days as string) || 0;
      const base = subscription.trialEndDate && subscription.trialEndDate > new Date()
        ? subscription.trialEndDate
        : new Date();
      const trialEndDate = new Date(base.getTime() + days * 86_400_000);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          trialEndDate,
          nextBillingDate: trialEndDate,
          status: subscription.status !== 'trial' ? 'trial' : undefined,
        },
      });
      return { changes: { trialEndDate, days } };
    }
    case 'cancel': {
      const cancelReason = body.reason as string | undefined;
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: cancelReason || undefined,
        },
      });
      await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'subscription_cancelled',
          amount: 0,
          currency: 'PHP',
          description: cancelReason || 'Cancelled by super-admin',
          recordedById: adminUserId,
        },
      });
      return { changes: { status: { from: previousStatus, to: 'cancelled' }, reason: cancelReason } };
    }
    case 'activate': {
      const wasTrial = subscription.isTrial;
      const wasDeactivated = !!subscription.deactivatedAt;
      const wasCancelled = previousStatus === 'cancelled';
      const reactivationReason = (body.reactivationReason as string | undefined)?.trim();
      const nextBilling = new Date();
      if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
      else nextBilling.setMonth(nextBilling.getMonth() + 1);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          isTrial: false,
          trialConvertedAt: (wasTrial && !subscription.trialConvertedAt) ? new Date() : undefined,
          nextBillingDate: nextBilling,
          gracePeriodEndDate: null,
          paymentOverdue: false,
          deactivatedAt: null,
          lateFeeAppliedAt: null,
          reactivationFeeAppliedAt: null,
        },
      });
      if (wasDeactivated) {
        await tx.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId,
            subscriptionId: subscription.id,
            type: 'account_reactivated',
            amount: 0,
            currency: 'PHP',
            description: 'Account reactivated by super-admin after outstanding balance settled',
            recordedById: adminUserId,
          },
        });
      }
      if (wasTrial) {
        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId,
            subscriptionId: subscription.id,
            type: 'trial_converted',
            amount: 0,
            currency: 'PHP',
            description: 'Trial converted to active subscription by super-admin',
            recordedById: adminUserId,
          },
        });
      }
      if (wasCancelled) {
        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId,
            subscriptionId: subscription.id,
            type: 'account_reactivated',
            amount: 0,
            currency: 'PHP',
            description: `Reactivated from cancelled by super-admin: ${reactivationReason}`,
            recordedById: adminUserId,
          },
        });
      }
      return { changes: { status: { from: previousStatus, to: 'active' }, reactivationReason: wasCancelled ? reactivationReason : undefined } };
    }
    case 'suspend': {
      const graceDays = body.graceDays as number | undefined;
      let gracePeriodEndDate: Date | undefined;
      if (graceDays && Number(graceDays) > 0) {
        gracePeriodEndDate = new Date();
        gracePeriodEndDate.setDate(gracePeriodEndDate.getDate() + Number(graceDays));
      }
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'suspended',
          suspendedAt: new Date(),
          gracePeriodEndDate,
        },
      });
      await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'subscription_suspended',
          amount: 0,
          currency: 'PHP',
          description: `Suspended by super-admin${graceDays ? ` (grace period: ${graceDays} days)` : ''}`,
          recordedById: adminUserId,
        },
      });
      return { changes: { status: { from: previousStatus, to: 'suspended' } } };
    }
    case 'pause': {
      const pauseReason = body.pauseReason as string | undefined;
      const pauseDays = body.pauseDays as number | undefined;
      let pauseEndsAt: Date | undefined;
      if (pauseDays && Number(pauseDays) > 0) {
        pauseEndsAt = new Date();
        pauseEndsAt.setDate(pauseEndsAt.getDate() + Number(pauseDays));
      }
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'paused',
          pausedAt: new Date(),
          pauseReason: pauseReason || undefined,
          pauseEndsAt,
        },
      });
      await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'subscription_paused',
          amount: 0,
          currency: 'PHP',
          description: pauseReason || 'Paused by super-admin',
          recordedById: adminUserId,
        },
      });
      return { changes: { status: { from: previousStatus, to: 'paused' }, pauseReason } };
    }
    case 'resume': {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          pausedAt: null,
          pauseReason: null,
          pauseEndsAt: null,
        },
      });
      await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'subscription_resumed',
          amount: 0,
          currency: 'PHP',
          description: 'Resumed by super-admin',
          recordedById: adminUserId,
        },
      });
      return { changes: { status: { from: previousStatus, to: 'active' } } };
    }
    case 'record-payment': {
      const payAmount = Number(body.amount);
      const payNotes = body.notes as string | undefined;
      const payTxId = body.transactionId as string | undefined;
      await tx.billingEvent.create({
        data: {
          id: randomUUID(),
          tenantId,
          subscriptionId: subscription.id,
          type: 'payment_received',
          amount: payAmount,
          currency: 'PHP',
          description: payNotes || 'Manual payment recorded by super-admin',
          notes: payNotes,
          transactionId: payTxId,
          recordedById: adminUserId,
        },
      });
      await tx.subscriptionBillingHistory.create({
        data: {
          id: randomUUID(),
          subscriptionId: subscription.id,
          date: new Date(),
          amount: payAmount,
          currency: 'PHP',
          status: 'paid',
          transactionId: payTxId,
        },
      });

      const outstandingBalance = Math.max(0, Number(subscription.outstandingBalance || 0) - payAmount);
      const wasDeactivated = !!subscription.deactivatedAt || subscription.status === 'suspended';
      const fullyPaid = outstandingBalance <= 0;
      const wasOverdue = subscription.paymentOverdue;

      const updateData: Prisma.SubscriptionUpdateInput = { outstandingBalance };

      if (fullyPaid && (wasOverdue || wasDeactivated)) {
        const nextBilling = new Date();
        if (subscription.billingCycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setMonth(nextBilling.getMonth() + 1);
        updateData.nextBillingDate = nextBilling;
        updateData.paymentOverdue = false;
        updateData.gracePeriodEndDate = null;
        updateData.deactivatedAt = null;
        updateData.lateFeeAppliedAt = null;
        updateData.reactivationFeeAppliedAt = null;
        if (wasDeactivated) updateData.status = 'active';
      }

      await tx.subscription.update({ where: { id: subscription.id }, data: updateData });

      if (fullyPaid && wasDeactivated) {
        await tx.tenant.update({ where: { id: tenantId }, data: { isActive: true } });
        await tx.billingEvent.create({
          data: {
            id: randomUUID(),
            tenantId,
            subscriptionId: subscription.id,
            type: 'account_reactivated',
            amount: 0,
            currency: 'PHP',
            description: 'Account reactivated automatically after payment settled outstanding balance',
            recordedById: adminUserId,
          },
        });
      }
      return { changes: { amount: payAmount, transactionId: payTxId, outstandingBalance, fullyPaid } };
    }
    default:
      // Unreachable — validateAction already rejected unknown actions.
      throw new Error(`Unknown action: ${action}`);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const { tenantSlug } = await params;
    const tenant = await resolveTenant(tenantSlug);
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
    const previousStatus = subscription.status;

    const validationError = await validateAction(action, body, subscription);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError.error }, { status: validationError.status });
    }

    // Idempotency: a double-click or a retried request with the same
    // transactionId must not double-credit the account — payment recording
    // is the highest-risk action here since it moves money on the ledger.
    if (action === 'record-payment' && body.transactionId) {
      const alreadyRecorded = await prisma.billingEvent.findFirst({
        where: {
          tenantId,
          subscriptionId: subscription.id,
          type: 'payment_received',
          transactionId: body.transactionId,
        },
      });
      if (alreadyRecorded) {
        const current = await prisma.subscription.findUnique({
          where: { id: subscription.id },
          include: { plan: { select: { name: true, tier: true, priceMonthly: true } } },
        });
        return NextResponse.json({ success: true, data: current });
      }
    }

    // Every action here writes the subscription plus at least one billing
    // event (and sometimes the tenant's isActive flag) — these must land
    // together or the ledger/tenant state can drift from the subscription
    // (e.g. status flipped to cancelled with no matching billing event).
    let auditPlan: AuditPlan;
    try {
      auditPlan = await prisma.$transaction(async (tx) => {
        return applyAction(action, body, subscription, tenantId, adminUser.userId, previousStatus, tx);
      });
    } catch (e) {
      // A concurrent request recorded this exact payment between our
      // pre-check above and this transaction's insert — the unique index
      // on {tenantId, transactionId} caught it. Treat as already-applied.
      if (
        action === 'record-payment' &&
        body.transactionId &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const current = await prisma.subscription.findUnique({
          where: { id: subscription.id },
          include: { plan: { select: { name: true, tier: true, priceMonthly: true } } },
        });
        return NextResponse.json({ success: true, data: current });
      }
      throw e;
    }

    await createAuditLog(request, {
      tenantId,
      userId: adminUser.userId,
      action: `subscription.${action.replace(/-/g, '_')}`,
      entityType: 'Subscription',
      entityId: subscription.id,
      changes: auditPlan.changes,
    });

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await prisma.superAdminAction.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.userId,
        action: `subscription.${action}`,
        targetType: 'Subscription',
        targetId: subscription.id,
        description: `Action "${action}" on subscription for tenant ${tenantSlug}`,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    const updated = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: { plan: { select: { name: true, tier: true, priceMonthly: true } } },
    });

    return NextResponse.json({ success: true, data: updated });
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
