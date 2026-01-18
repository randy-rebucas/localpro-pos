/**
 * API Route for Dynamic Pricing
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyDynamicPricing } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, enableTimeBased, enableDemandBased, enableStockBased } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await applyDynamicPricing({ tenantId, enableTimeBased, enableDemandBased, enableStockBased });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Dynamic pricing error:', error);
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
    const enableTimeBased = searchParams.get('enableTimeBased') === 'true';
    const enableDemandBased = searchParams.get('enableDemandBased') === 'true';
    const enableStockBased = searchParams.get('enableStockBased') === 'true';

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await applyDynamicPricing({ tenantId, enableTimeBased, enableDemandBased, enableStockBased });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Dynamic pricing error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
