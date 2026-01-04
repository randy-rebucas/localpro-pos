/**
 * API Route for Product Performance Alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeProductPerformance } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, daysToAnalyze, slowMovingThreshold } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await analyzeProductPerformance({ tenantId, daysToAnalyze, slowMovingThreshold });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Product performance analysis error:', error);
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
    const daysToAnalyze = searchParams.get('daysToAnalyze')
      ? parseInt(searchParams.get('daysToAnalyze')!, 10)
      : undefined;
    const slowMovingThreshold = searchParams.get('slowMovingThreshold')
      ? parseInt(searchParams.get('slowMovingThreshold')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await analyzeProductPerformance({ tenantId, daysToAnalyze, slowMovingThreshold });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Product performance analysis error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
