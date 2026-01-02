/**
 * API Route for Stock Transfer
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectStockImbalances } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, autoApprove, minStockThreshold } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectStockImbalances({ tenantId, autoApprove, minStockThreshold });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Stock transfer error:', error);
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
    const autoApprove = searchParams.get('autoApprove') === 'true';
    const minStockThreshold = searchParams.get('minStockThreshold')
      ? parseInt(searchParams.get('minStockThreshold')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectStockImbalances({ tenantId, autoApprove, minStockThreshold });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Stock transfer error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
