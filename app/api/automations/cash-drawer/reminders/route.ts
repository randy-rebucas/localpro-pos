/**
 * API Route for Cash Count Reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendCashCountReminders } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, reminderMinutesBefore } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    const result = await sendCashCountReminders({ tenantId, reminderMinutesBefore });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Cash count reminders error:', error);
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
    const reminderMinutesBefore = searchParams.get('reminderMinutesBefore')
      ? parseInt(searchParams.get('reminderMinutesBefore')!, 10)
      : undefined;

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    const result = await sendCashCountReminders({ tenantId, reminderMinutesBefore });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Cash count reminders error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
