import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Webhook from '@/models/Webhook';
import { requireTenantAccess } from '@/lib/api-tenant';
import { dispatchWebhook, validateWebhookUrl } from '@/lib/webhooks';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/webhooks/[id]/test — Send a test payload to the webhook URL
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Rate limit: 5 test requests per minute per IP to prevent abuse
    const ip = getClientIp(request);
    const rl = checkRateLimit(`webhook-test:${ip}`, 5, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many test requests. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const hook = await Webhook.findOne({ _id: id, tenantId });
    if (!hook) return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });

    // Re-validate URL at test time to catch any URL changes
    const urlError = validateWebhookUrl(hook.url);
    if (urlError) {
      return NextResponse.json({ success: false, error: `Webhook URL is invalid: ${urlError}` }, { status: 400 });
    }

    const testEvent = hook.events[0];
    await dispatchWebhook(tenantId, testEvent, {
      test: true,
      message: 'This is a test webhook delivery from 1pos',
      webhookId: id,
    });

    return NextResponse.json({
      success: true,
      data: { message: `Test payload sent for event: ${testEvent}` },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to send test webhook');
  }
}
