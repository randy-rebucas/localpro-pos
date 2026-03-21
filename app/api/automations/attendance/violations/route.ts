/**
 * API Route for Attendance Violation Alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { detectAttendanceViolations } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, lateThresholdMinutes } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    const result = await detectAttendanceViolations({ tenantId, lateThresholdMinutes });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Attendance violations error:', error);
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
    const tenantId = searchParams.get('tenantId') || undefined;
    const lateThresholdMinutes = searchParams.get('lateThresholdMinutes')
      ? parseInt(searchParams.get('lateThresholdMinutes')!, 10)
      : undefined;

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    const result = await detectAttendanceViolations({ tenantId, lateThresholdMinutes });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Attendance violations error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
