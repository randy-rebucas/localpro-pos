/**
 * API Route for Sales Trend Analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeSalesTrends } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, period, comparePeriods } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await analyzeSalesTrends({ tenantId, period, comparePeriods });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Sales trend analysis error:', error);
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
    const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | undefined;
    const comparePeriods = searchParams.get('comparePeriods') !== 'false';

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await analyzeSalesTrends({ tenantId, period, comparePeriods });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Sales trend analysis error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      processed: 0,
      failed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
