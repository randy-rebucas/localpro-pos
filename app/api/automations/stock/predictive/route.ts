/**
 * API Route for Predictive Stock Replenishment
 */

import { NextRequest, NextResponse } from 'next/server';
import { predictStockNeeds } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, analysisDays, predictionDays } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await predictStockNeeds({ tenantId, analysisDays, predictionDays });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Predictive stock error:', error);
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
    const analysisDays = searchParams.get('analysisDays')
      ? parseInt(searchParams.get('analysisDays')!, 10)
      : undefined;
    const predictionDays = searchParams.get('predictionDays')
      ? parseInt(searchParams.get('predictionDays')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await predictStockNeeds({ tenantId, analysisDays, predictionDays });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Predictive stock error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
