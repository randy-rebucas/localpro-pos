import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Webhook, { WEBHOOK_EVENTS } from '@/models/Webhook';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import { validateWebhookUrl } from '@/lib/webhooks';
import crypto from 'crypto';

/**
 * GET /api/webhooks — List webhooks for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);

    const hooks = await Webhook.find({ tenantId })
      .select('-secret')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: hooks });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list webhooks');
  }
}

/**
 * POST /api/webhooks — Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { name, url, events } = body;

    if (!name?.trim() || !url?.trim()) {
      return NextResponse.json({ success: false, error: 'name and url are required' }, { status: 400 });
    }

    // Validate URL (SSRF prevention)
    const urlError = validateWebhookUrl(url);
    if (urlError) {
      return NextResponse.json({ success: false, error: urlError }, { status: 400 });
    }

    const validEvents = (events || []).filter((e: string) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (validEvents.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one valid event is required' }, { status: 400 });
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const hook = await Webhook.create({
      name: name.trim(),
      url: url.trim(),
      events: validEvents,
      secret,
      tenantId,
      createdBy: userId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'webhook',
      entityId: hook._id.toString(),
      metadata: { name, events: validEvents },
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: hook._id,
        name: hook.name,
        url: hook.url,
        events: hook.events,
        isActive: hook.isActive,
        secret, // Only returned on creation
        message: 'Store the secret securely — it will not be shown again.',
        createdAt: hook.createdAt,
      },
    }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create webhook');
  }
}
