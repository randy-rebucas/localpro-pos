/**
 * API Route for Multi-Branch Data Sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { syncMultiBranchData } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution: conflictResolutionRaw } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    // Validate conflictResolution type
    const conflictResolution = (conflictResolutionRaw === 'manual' || conflictResolutionRaw === 'last-write-wins')
      ? conflictResolutionRaw
      : undefined;

    const result = await syncMultiBranchData({ tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    // Validate conflictResolution type
    const conflictResolution = (conflictResolutionRaw === 'manual' || conflictResolutionRaw === 'last-write-wins')
      ? conflictResolutionRaw
      : 'last-write-wins';

    const result = await syncMultiBranchData({ tenantId, syncProducts, syncCustomers, syncDiscounts, conflictResolution });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
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
