/**
 * API Route for Suspicious Activity Detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { detectSuspiciousActivity } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, refundThreshold, voidThreshold, discountThreshold, failedLoginThreshold } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectSuspiciousActivity({
      tenantId,
      refundThreshold,
      voidThreshold,
      discountThreshold,
      failedLoginThreshold,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Suspicious activity detection error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
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

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await detectSuspiciousActivity({
      tenantId,
      refundThreshold,
      voidThreshold,
      discountThreshold,
      failedLoginThreshold,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Suspicious activity detection error:', error);
    return NextResponse.json({
      success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processed: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
    }, { status: 500 });
  }
}
