import { NextRequest, NextResponse } from 'next/server';
import { retryPendingDeliveries } from '@/lib/webhooks';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/automations/webhooks/retry
 * Cron: retry failed/pending webhook deliveries.
 * Called every 5 minutes by the scheduler.
 * Requires Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await retryPendingDeliveries();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Webhook retry failed');
  }
}
