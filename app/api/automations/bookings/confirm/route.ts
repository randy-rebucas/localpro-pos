/**
 * API Route for Automatic Booking Confirmations
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { autoConfirmBookings } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, bookingId } = body;

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

    const result = await autoConfirmBookings({ tenantId, bookingId });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Booking confirmation automation error:', error);
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
    const bookingId = searchParams.get('bookingId') || undefined;

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

    const result = await autoConfirmBookings({ tenantId, bookingId });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Booking confirmation automation error:', error);
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
