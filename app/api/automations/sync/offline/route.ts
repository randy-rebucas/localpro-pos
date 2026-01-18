/**
 * API Route for Offline Transaction Sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncOfflineTransactions } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, maxRetries } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncOfflineTransactions({ tenantId, maxRetries });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Offline sync error:', error);
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
    const maxRetries = searchParams.get('maxRetries')
      ? parseInt(searchParams.get('maxRetries')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncOfflineTransactions({ tenantId, maxRetries });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Offline sync error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
