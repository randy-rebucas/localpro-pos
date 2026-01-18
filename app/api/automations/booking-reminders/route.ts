/**
 * API Route for Automated Booking Reminders
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendBookingReminders } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, hoursBefore } = body;

    // Optional: Add authentication/authorization for manual triggers
    // For cron jobs, you might want to use a secret token
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader && cronSecret) {
      const token = authHeader.replace('Bearer ', '');
      if (token !== cronSecret) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const result = await sendBookingReminders({
      tenantId,
      hoursBefore: hoursBefore || 24,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Booking reminders automation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
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

    // Allow Vercel cron jobs (they send a special header) or verify secret
    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    // Allow if: Vercel cron, or no secret configured, or secret matches
    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await sendBookingReminders({
      tenantId,
      hoursBefore: hoursBefore || 24,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Booking reminders automation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      },
      { status: 500 }
    );
  }
}
