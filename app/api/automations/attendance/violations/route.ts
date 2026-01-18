/**
 * API Route for Attendance Violation Alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectAttendanceViolations } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, lateThresholdMinutes } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectAttendanceViolations({ tenantId, lateThresholdMinutes });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Attendance violations error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId') || undefined;
    const lateThresholdMinutes = searchParams.get('lateThresholdMinutes')
      ? parseInt(searchParams.get('lateThresholdMinutes')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectAttendanceViolations({ tenantId, lateThresholdMinutes });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Attendance violations error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
