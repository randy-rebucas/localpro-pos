/**
 * API Route for Automatic No-Show Detection
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectNoShows } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, gracePeriodMinutes } = body;

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

    const result = await detectNoShows({
      tenantId,
      gracePeriodMinutes,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('No-show detection automation error:', error);
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
    const gracePeriodMinutes = searchParams.get('gracePeriodMinutes')
      ? parseInt(searchParams.get('gracePeriodMinutes')!, 10)
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

    const result = await detectNoShows({
      tenantId,
      gracePeriodMinutes,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('No-show detection automation error:', error);
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
