/**
 * API Route for Multi-Branch Data Sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncMultiBranchData } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution: conflictResolutionRaw } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Validate conflictResolution type
    const conflictResolution = (conflictResolutionRaw === 'manual' || conflictResolutionRaw === 'last-write-wins')
      ? conflictResolutionRaw
      : undefined;

    const result = await syncMultiBranchData({ tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Multi-branch sync error:', error);
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
    const syncProducts = searchParams.get('syncProducts') !== 'false';
    const syncCustomers = searchParams.get('syncCustomers') !== 'false';
    const syncDiscounts = searchParams.get('syncDiscounts') !== 'false';
    const conflictResolutionRaw = searchParams.get('conflictResolution') || 'last-write-wins';

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Validate conflictResolution type
    const conflictResolution = (conflictResolutionRaw === 'manual' || conflictResolutionRaw === 'last-write-wins')
      ? conflictResolutionRaw
      : 'last-write-wins';

    const result = await syncMultiBranchData({ tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Multi-branch sync error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
