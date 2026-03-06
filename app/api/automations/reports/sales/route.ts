/**
 * API Route for Automated Sales Report Delivery
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendSalesReport } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, period } = body;

        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    const result = await sendSalesReport({
      tenantId,
      period: period || 'daily',
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Sales report automation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error.message}`,
        processed: 0,
        failed: 0,
        errors: [error.message],
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tenantId = searchParams.get('tenantId') || undefined;
    const period = (searchParams.get('period') || 'daily') as 'daily' | 'weekly' | 'monthly';

        const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;


    const result = await sendSalesReport({
      tenantId,
      period,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Sales report automation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error.message}`,
        processed: 0,
        failed: 0,
        errors: [error.message],
      },
      { status: 500 }
    );
  }
}
