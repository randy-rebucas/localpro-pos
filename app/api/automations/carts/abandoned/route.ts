/**
 * API Route for Abandoned Cart Reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendAbandonedCartReminders } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, hoursAgo } = body;

    const authError = verifyCronAuth(request, body.secret || null);
    if (authError) return authError;

    const result = await sendAbandonedCartReminders({ tenantId, hoursAgo });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Abandoned cart reminders error:', error);
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
    const hoursAgo = searchParams.get('hoursAgo')
      ? parseInt(searchParams.get('hoursAgo')!, 10)
      : undefined;

    const secret = searchParams.get('secret');
    const authError = verifyCronAuth(request, secret);
    if (authError) return authError;

    const result = await sendAbandonedCartReminders({ tenantId, hoursAgo });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Abandoned cart reminders error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
