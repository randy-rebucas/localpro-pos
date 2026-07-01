/**
 * Subscription Billing Lifecycle Automation Endpoint
 *
 * See lib/automations/subscription-billing.ts for the full lifecycle:
 * invoice generation -> grace period -> reminders -> deactivation -> late fee -> reactivation fee
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { logger } from '@/lib/logger';
import { validTenantId } from '@/lib/automation-validation';
import { processSubscriptionBilling } from '@/lib/automations/subscription-billing';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { secret } = body;

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await processSubscriptionBilling({
      tenantId: validTenantId(body.tenantId),
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Subscription billing automation error', error);
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

    const result = await processSubscriptionBilling({
      tenantId: validTenantId(searchParams.get('tenantId')),
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Subscription billing automation error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${message}`,
      processed: 0,
      failed: 0,
      errors: [message],
    }, { status: 500 });
  }
}
