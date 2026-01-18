/**
 * API Route for Automatic Discount Management
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { manageDiscountStatus } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId } = body;

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

    const result = await manageDiscountStatus({ tenantId });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Discount management automation error:', error);
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId') || undefined;

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

    const result = await manageDiscountStatus({ tenantId });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Discount management automation error:', error);
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
