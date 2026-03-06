/**
 * API Route for Automatic Cash Drawer Closure
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { autoCloseCashDrawers } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, forceClose } = body;
        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    const result = await autoCloseCashDrawers({
      tenantId,
      forceClose,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Cash drawer auto-close automation error:', error);
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
    const forceClose = searchParams.get('forceClose') === 'true';

        const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await autoCloseCashDrawers({
      tenantId,
      forceClose,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Cash drawer auto-close automation error:', error);
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
