/**
 * API Route for BIR Sales Summary Export/Push (daily or monthly, EIS/eSales-readiness)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { generateSalesSummaryExport } from '@/lib/automations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, period, businessDate, secret } = body;

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await generateSalesSummaryExport({
      tenantId,
      period: period === 'monthly' ? 'monthly' : 'daily',
      businessDate: businessDate ? new Date(businessDate) : undefined,
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Sales summary export error', error);
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
    const period = searchParams.get('period') === 'monthly' ? 'monthly' : 'daily';
    const businessDateParam = searchParams.get('businessDate');

    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await generateSalesSummaryExport({
      tenantId,
      period,
      businessDate: businessDateParam ? new Date(businessDateParam) : undefined,
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Sales summary export error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
