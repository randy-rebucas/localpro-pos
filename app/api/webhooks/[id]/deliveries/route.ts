import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Webhook from '@/models/Webhook';
import WebhookDelivery from '@/models/WebhookDelivery';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';

/**
 * GET /api/webhooks/[id]/deliveries — List delivery history for a webhook
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const hook = await Webhook.findOne({ _id: id, tenantId });
    if (!hook) return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 200);
    const deliveries = await WebhookDelivery.find({ webhookId: id, tenantId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ success: true, data: deliveries });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list webhook deliveries');
  }
}
