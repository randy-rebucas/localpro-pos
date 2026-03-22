/**
 * API Route for Suspicious Activity Detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { detectSuspiciousActivity } from '@/lib/automations';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, refundThreshold, voidThreshold, discountThreshold, failedLoginThreshold } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    const result = await detectSuspiciousActivity({
      tenantId,
      refundThreshold,
      voidThreshold,
      discountThreshold,
      failedLoginThreshold,
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Suspicious activity detection error:', error);
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
    const refundThreshold = searchParams.get('refundThreshold')
      ? parseInt(searchParams.get('refundThreshold')!, 10)
      : undefined;
    const voidThreshold = searchParams.get('voidThreshold')
      ? parseInt(searchParams.get('voidThreshold')!, 10)
      : undefined;
    const discountThreshold = searchParams.get('discountThreshold')
      ? parseFloat(searchParams.get('discountThreshold')!)
      : undefined;
    const failedLoginThreshold = searchParams.get('failedLoginThreshold')
      ? parseInt(searchParams.get('failedLoginThreshold')!, 10)
      : undefined;

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    const result = await detectSuspiciousActivity({
      tenantId,
      refundThreshold,
      voidThreshold,
      discountThreshold,
      failedLoginThreshold,
    });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Suspicious activity detection error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
