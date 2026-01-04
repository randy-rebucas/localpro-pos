/**
 * API Route for Audit Log Cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import { cleanupAuditLogs } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, retentionYears, archive } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await cleanupAuditLogs({ tenantId, retentionYears, archive });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Audit log cleanup error:', error);
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
    const retentionYears = searchParams.get('retentionYears')
      ? parseInt(searchParams.get('retentionYears')!, 10)
      : undefined;
    const archive = searchParams.get('archive') === 'true';

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await cleanupAuditLogs({ tenantId, retentionYears, archive });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Audit log cleanup error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
