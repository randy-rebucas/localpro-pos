/**
 * API Route for automatic BIR Z-Readings. Pass businessDate (YYYY-MM-DD) to fill in a missed day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { generateDailyZReadings } from '@/lib/automations';
import { logger } from '@/lib/logger';

async function run(tenantId?: string, businessDate?: string) {
  if (businessDate && !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return NextResponse.json({ success: false, error: 'businessDate must be YYYY-MM-DD' }, { status: 400 });
  }
  return NextResponse.json(await generateDailyZReadings({ tenantId, businessDate }));
}

function failure(error: unknown) {
  logger.error('Automatic Z-Reading error', error);
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({
    success: false,
    message: `Error: ${message}`,
    processed: 0,
    failed: 0,
    errors: [message],
  }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, businessDate, secret } = await request.json().catch(() => ({}));

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    return await run(tenantId, businessDate);
  } catch (error: unknown) {
    return failure(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    return await run(searchParams.get('tenantId') || undefined, searchParams.get('businessDate') || undefined);
  } catch (error: unknown) {
    return failure(error);
  }
}
