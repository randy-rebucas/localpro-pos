/**
 * API Route for Transaction Receipt Auto-Email
 * Can be called by cron jobs or manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendTransactionReceipt, sendPendingReceipts } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { transactionId, customerEmail, tenantId, hoursAgo } = body;

    // Optional: Add authentication/authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader && cronSecret) {
      const token = authHeader.replace('Bearer ', '');
      if (token !== cronSecret) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

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
  } catch (error: unknown) {
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

    // Allow Vercel cron jobs (they send a special header) or verify secret
    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    // Allow if: Vercel cron, or no secret configured, or secret matches
    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
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
  } catch (error: unknown) {
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
