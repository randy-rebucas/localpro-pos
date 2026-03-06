/**
 * API Route for Transaction Receipt Auto-Email
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/automation-auth';
import { sendTransactionReceipt, sendPendingReceipts } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { transactionId, customerEmail, tenantId, hoursAgo } = body;

        const authError = verifyCronAuth(request, null);
    if (authError) return authError;

    // If transactionId is provided, send receipt for that transaction
    if (transactionId) {
      const result = await sendTransactionReceipt({
        transactionId,
        customerEmail,
      });
      return NextResponse.json(result);
    }

    // Otherwise, send pending receipts
    const result = await sendPendingReceipts({
      tenantId,
      hoursAgo: hoursAgo || 24,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Transaction receipt automation error:', error);
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
    const transactionId = searchParams.get('transactionId') || undefined;
    const customerEmail = searchParams.get('customerEmail') || undefined;
    const tenantId = searchParams.get('tenantId') || undefined;
    const hoursAgo = searchParams.get('hoursAgo')
      ? parseInt(searchParams.get('hoursAgo')!, 10)
      : undefined;

        const authError = verifyCronAuth(request, searchParams.get('secret'));
    if (authError) return authError;

      );
    }

    if (transactionId) {
      const result = await sendTransactionReceipt({
        transactionId,
        customerEmail,
      });
      return NextResponse.json(result);
    }

    const result = await sendPendingReceipts({
      tenantId,
      hoursAgo: hoursAgo || 24,
    });

    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Transaction receipt automation error:', error);
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
