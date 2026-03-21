/**
 * API Route for Session Expiration
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { expireInactiveSessions } from '@/lib/automations';
import { logger } from '@/lib/logger';
import { positiveFloat, validTenantId } from '@/lib/automation-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { secret } = body;

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await expireInactiveSessions({
      tenantId: validTenantId(body.tenantId),
      inactivityHours: positiveFloat(body.inactivityHours, 24, 720),
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Session expiration error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await expireInactiveSessions({
      tenantId: validTenantId(searchParams.get('tenantId')),
      inactivityHours: positiveFloat(searchParams.get('inactivityHours'), 24, 720),
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Session expiration error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
