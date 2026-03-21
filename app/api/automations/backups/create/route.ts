/**
 * API Route for Database Backups
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { createDatabaseBackup } from '@/lib/automations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, backupPath, uploadToCloud, secret } = body;

    const authError = verifyCronAuth(request, secret ?? null);
    if (authError) return authError;

    const result = await createDatabaseBackup({ tenantId, backupPath, uploadToCloud });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Database backup error', error);
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

    const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

    const result = await createDatabaseBackup({ tenantId });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Database backup error', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
