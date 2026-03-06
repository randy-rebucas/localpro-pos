/**
 * API Route for Low Stock Alerts
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendLowStockAlerts } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, threshold } = body;

        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    const result = await sendLowStockAlerts({
      tenantId,
      threshold,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Low stock alerts automation error:', error);
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
    const threshold = searchParams.get('threshold')
      ? parseInt(searchParams.get('threshold')!, 10)
      : undefined;

        const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

      );
    }

    const result = await sendLowStockAlerts({
      tenantId,
      threshold,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Low stock alerts automation error:', error);
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
