/**
 * API Route for Automatic Attendance Clock-Out
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { autoClockOutForgottenSessions } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, gracePeriodHours } = body;

    // Allow Vercel cron jobs or verify secret
    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await autoClockOutForgottenSessions({
      tenantId,
      gracePeriodHours,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Auto clock-out automation error:', error);
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
    const tenantId = searchParams.get('tenantId') || undefined;
    const gracePeriodHours = searchParams.get('gracePeriodHours')
      ? parseInt(searchParams.get('gracePeriodHours')!, 10)
      : undefined;

    // Allow Vercel cron jobs or verify secret
    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await autoClockOutForgottenSessions({
      tenantId,
      gracePeriodHours,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Auto clock-out automation error:', error);
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
