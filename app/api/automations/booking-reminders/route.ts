/**
 * API Route for Automated Booking Reminders
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendBookingReminders } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, hoursBefore } = body;

        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    const result = await sendBookingReminders({
      tenantId,
      hoursBefore: hoursBefore || 24,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Booking reminders automation error:', error);
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

// Also support GET for easy cron job setup
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId') || undefined;
    const hoursBefore = searchParams.get('hoursBefore')
      ? parseInt(searchParams.get('hoursBefore')!, 10)
      : undefined;

        const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;


    const result = await sendBookingReminders({
      tenantId,
      hoursBefore: hoursBefore || 24,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Booking reminders automation error:', error);
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
