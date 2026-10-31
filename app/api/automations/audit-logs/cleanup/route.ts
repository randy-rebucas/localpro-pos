/**
 * API Route for Audit Log Cleanup
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { cleanupAuditLogs } from '@/lib/automations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, retentionDays, retentionYears, archive } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    const result = await cleanupAuditLogs({ tenantId, retentionDays, retentionYears, archive });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Audit log cleanup error:', error);
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
    const retentionDays = searchParams.get('retentionDays')
      ? parseInt(searchParams.get('retentionDays')!, 10)
      : undefined;
    const retentionYears = searchParams.get('retentionYears')
      ? parseInt(searchParams.get('retentionYears')!, 10)
      : undefined;
    // Archive unless explicitly disabled: the Vercel cron calls this without
    // params, and audit logs are BIR records that must not be silently deleted.
    const archive = searchParams.get('archive') !== 'false';

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    const result = await cleanupAuditLogs({ tenantId, retentionDays, retentionYears, archive });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Audit log cleanup error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
