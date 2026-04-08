import { NextRequest, NextResponse } from 'next/server';
import { checkExpiryAlerts } from '@/lib/automations/expiry-alerts';
import { handleApiError } from '@/lib/error-handler';

/**
 * POST /api/automations/inventory/expiry-alerts
 * Cron: Check for expiring product batches and notify owners.
 * Called daily by the scheduler.
 * Requires Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkExpiryAlerts();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Expiry alert check failed');
  }
}
