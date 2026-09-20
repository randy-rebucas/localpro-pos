/**
 * Subscription Expiry Automation
 *
 * - Expires trial subscriptions past their trialEndDate
 * - Expires active subscriptions past their endDate (non-auto-renew)
 * - Suspends auto-renew subscriptions past their billing date (grace period)
 */

import { randomUUID } from 'crypto';
import prisma, { dbTransaction } from '@/lib/db';
import { positiveInt } from '@/lib/automation-validation';
import { logger } from '@/lib/logger';

export interface ExpireSubscriptionsResult {
  success: boolean;
  message: string;
  processed: number;
  failed: number;
  details: {
    trialsExpired: number;
    subscriptionsExpired: number;
    subscriptionsSuspended: number;
  };
  errors: string[];
}

export async function expireSubscriptions(options?: {
  tenantId?: string;
  gracePeriodDays?: number;
}): Promise<ExpireSubscriptionsResult> {
  const now = new Date();
  const gracePeriodDays = positiveInt(options?.gracePeriodDays, 3, 30);
  const graceDate = new Date(now.getTime() - gracePeriodDays * 24 * 60 * 60 * 1000);
  const errors: string[] = [];
  let trialsExpired = 0;
  let subscriptionsExpired = 0;
  let subscriptionsSuspended = 0;

  const tenantFilter = options?.tenantId ? { tenantId: options.tenantId } : {};

  try {
    // 1. Expire trial subscriptions past trialEndDate
    const expiringTrials = await prisma.subscription.findMany({
      where: {
        ...tenantFilter,
        status: 'trial',
        isTrial: true,
        trialEndDate: { lte: now },
      },
      select: { id: true, tenantId: true },
    });

    if (expiringTrials.length > 0) {
      // Status flip and billing-event record must land together — otherwise a
      // subscription can end up expired with no corresponding trial_expired
      // event, breaking the billing/audit trail with nothing flagging it for
      // reconciliation.
      try {
        await dbTransaction(async (tx) => {
          const expiredTrials = await tx.subscription.updateMany({
            where: { id: { in: expiringTrials.map((s) => s.id) } },
            data: { status: 'inactive', isTrial: false },
          });
          trialsExpired = expiredTrials.count;

          await tx.billingEvent.createMany({
            data: expiringTrials.map((sub) => ({
              id: randomUUID(),
              tenantId: sub.tenantId,
              subscriptionId: sub.id,
              type: 'trial_expired' as const,
              amount: 0,
              description: 'Trial expired without conversion to a paid plan',
            })),
          });
        });
      } catch (e) {
        trialsExpired = 0;
        throw e;
      }
    }

    // 2. Expire active subscriptions past their endDate
    const expiredSubs = await prisma.subscription.updateMany({
      where: {
        ...tenantFilter,
        status: 'active',
        endDate: { not: null, lte: now },
        autoRenew: false,
      },
      data: { status: 'inactive' },
    });
    subscriptionsExpired = expiredSubs.count;

    // 3. Suspend auto-renew subscriptions past billing date (grace period)
    //    These haven't been billed — likely payment failure
    const suspendedSubs = await prisma.subscription.updateMany({
      where: {
        ...tenantFilter,
        status: 'active',
        autoRenew: true,
        nextBillingDate: { lte: graceDate },
      },
      data: {
        status: 'suspended',
        suspendedAt: now,
      },
    });
    subscriptionsSuspended = suspendedSubs.count;

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(msg);
    logger.error('Subscription expiry error', error);
  }

  const processed = trialsExpired + subscriptionsExpired + subscriptionsSuspended;

  return {
    success: errors.length === 0,
    message: processed > 0
      ? `Processed ${processed} subscription(s): ${trialsExpired} trials expired, ${subscriptionsExpired} subscriptions expired, ${subscriptionsSuspended} suspended`
      : 'No subscriptions to process',
    processed,
    failed: errors.length,
    details: {
      trialsExpired,
      subscriptionsExpired,
      subscriptionsSuspended,
    },
    errors,
  };
}
