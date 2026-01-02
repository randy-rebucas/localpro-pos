/**
 * API Route for Automatic Break Detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectBreaks } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, inactivityMinutes } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectBreaks({ tenantId, inactivityMinutes });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Break detection error:', error);
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
    const inactivityMinutes = searchParams.get('inactivityMinutes')
      ? parseInt(searchParams.get('inactivityMinutes')!, 10)
      : undefined;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectBreaks({ tenantId, inactivityMinutes });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Break detection error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
