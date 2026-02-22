/**
 * API Route for Purchase Order Generation
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePurchaseOrders } from '@/lib/automations';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { tenantId, generateDocuments, sendToSuppliers } = body;

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = body.secret;

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await generatePurchaseOrders({ tenantId, generateDocuments, sendToSuppliers });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Purchase order generation error:', error);
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

    const isVercelCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = searchParams.get('secret');

    if (cronSecret && !isVercelCron && providedSecret !== cronSecret) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await generatePurchaseOrders({ tenantId });
    return NextResponse.json(result);
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Purchase order generation error:', error);
    return NextResponse.json({
      success: false,
      message: `Error: ${error.message}`,
      processed: 0,
      failed: 0,
      errors: [error.message],
    }, { status: 500 });
  }
}
