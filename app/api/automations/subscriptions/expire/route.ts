/**
 * Subscription Expiry Automation
 *
 * - Expires active subscriptions past their endDate or nextBillingDate
 * - Expires trial subscriptions past their trialEndDate
 * - Suspends subscriptions with failed billing (grace period)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { logger } from '@/lib/logger';
import { positiveInt, validTenantId } from '@/lib/automation-validation';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';

interface ExpireResult {
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

async function expireSubscriptions(options?: {
  tenantId?: string;
  gracePeriodDays?: number;
}): Promise<ExpireResult> {
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
    const expiredTrials = await Subscription.updateMany(
      {
        ...tenantFilter,
        status: 'trial',
        isTrial: true,
        trialEndDate: { $lte: now },
      },
      {
        $set: {
          status: 'inactive',
          isTrial: false,
        },
      }
    );
    trialsExpired = expiredTrials.modifiedCount;

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { secret } = body;

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await expireSubscriptions({
      tenantId: validTenantId(body.tenantId),
      gracePeriodDays: body.gracePeriodDays,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Subscription expiry error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${message}`,
      processed: 0,
      failed: 0,
      errors: [message],
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await expireSubscriptions({
      tenantId: validTenantId(searchParams.get('tenantId')),
      gracePeriodDays: searchParams.get('gracePeriodDays')
        ? parseInt(searchParams.get('gracePeriodDays')!, 10)
        : undefined,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Subscription expiry error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${message}`,
      processed: 0,
      failed: 0,
      errors: [message],
    }, { status: 500 });
  }
}
