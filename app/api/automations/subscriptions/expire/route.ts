/**
 * Subscription Expiry Automation (HTTP trigger)
 *
 * Also runs internally on a schedule via lib/cron.ts — see lib/automations/subscription-expiry.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { logger } from '@/lib/logger';
import { validTenantId } from '@/lib/automation-validation';
import { expireSubscriptions } from '@/lib/automations/subscription-expiry';

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
