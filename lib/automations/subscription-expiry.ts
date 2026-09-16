/**
 * Subscription Expiry Automation
 *
 * - Expires trial subscriptions past their trialEndDate
 * - Expires active subscriptions past their endDate (non-auto-renew)
 * - Suspends auto-renew subscriptions past their billing date (grace period)
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import BillingEvent from '@/models/BillingEvent';
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
  await connectDB();

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
    const expiringTrials = await Subscription.find({
      ...tenantFilter,
      status: 'trial',
      isTrial: true,
      trialEndDate: { $lte: now },
    }).select('_id tenantId');

    if (expiringTrials.length > 0) {
      // Status flip and billing-event record must land together — otherwise a
      // subscription can end up expired with no corresponding trial_expired
      // event, breaking the billing/audit trail with nothing flagging it for
      // reconciliation.
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        const expiredTrials = await Subscription.updateMany(
          { _id: { $in: expiringTrials.map((s) => s._id) } },
          { $set: { status: 'inactive', isTrial: false } },
          { session }
        );
        trialsExpired = expiredTrials.modifiedCount;

        await BillingEvent.insertMany(
          expiringTrials.map((sub) => ({
            tenantId: sub.tenantId,
            subscriptionId: sub._id,
            type: 'trial_expired' as const,
            amount: 0,
            description: 'Trial expired without conversion to a paid plan',
          })),
          { session }
        );

        await session.commitTransaction();
      } catch (e) {
        await session.abortTransaction();
        trialsExpired = 0;
        throw e;
      } finally {
        session.endSession();
      }
    }

    // 2. Expire active subscriptions past their endDate
    const expiredSubs = await Subscription.updateMany(
      {
        ...tenantFilter,
        status: 'active',
        endDate: { $exists: true, $lte: now },
        autoRenew: false,
      },
      {
        $set: { status: 'inactive' },
      }
    );
    subscriptionsExpired = expiredSubs.modifiedCount;

    // 3. Suspend auto-renew subscriptions past billing date (grace period)
    //    These haven't been billed — likely payment failure
    const suspendedSubs = await Subscription.updateMany(
      {
        ...tenantFilter,
        status: 'active',
        autoRenew: true,
        nextBillingDate: { $lte: graceDate },
      },
      {
        $set: {
          status: 'suspended',
          suspendedAt: now,
        },
      }
    );
    subscriptionsSuspended = suspendedSubs.modifiedCount;

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
