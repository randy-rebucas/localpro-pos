/**
 * API Route for Automatic Attendance Clock-Out
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { autoClockOutForgottenSessions } from '@/lib/automations';
import { logger } from '@/lib/logger';
import { positiveFloat, validTenantId } from '@/lib/automation-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { secret } = body;
    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await autoClockOutForgottenSessions({
      tenantId: validTenantId(body.tenantId),
      gracePeriodHours: positiveFloat(body.gracePeriodHours, 8, 72),
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Auto clock-out automation error', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error.message}`,
        processed: 0,
        failed: 0,
        errors: [error.message],
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await autoClockOutForgottenSessions({
      tenantId: validTenantId(searchParams.get('tenantId')),
      gracePeriodHours: positiveFloat(searchParams.get('gracePeriodHours'), 8, 72),
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Auto clock-out automation error', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error.message}`,
        processed: 0,
        failed: 0,
        errors: [error.message],
      },
      { status: 500 }
    );
  }
}
