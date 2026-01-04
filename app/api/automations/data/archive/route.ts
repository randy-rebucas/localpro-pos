/**
 * API Route for Data Archiving
 */

import { NextRequest, NextResponse } from 'next/server';
import { archiveOldData } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, archiveYears, collections } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await archiveOldData({ tenantId, archiveYears, collections });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Data archiving error:', error);
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
    const archiveYears = searchParams.get('archiveYears')
      ? parseInt(searchParams.get('archiveYears')!, 10)
      : undefined;
    const collections = searchParams.get('collections')
      ? searchParams.get('collections')!.split(',')
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await archiveOldData({ tenantId, archiveYears, collections });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Data archiving error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
