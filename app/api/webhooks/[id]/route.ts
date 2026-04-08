import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Webhook, { WEBHOOK_EVENTS } from '@/models/Webhook';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

/**
 * PATCH /api/webhooks/[id] — Update a webhook
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;
    const body = await request.json();

    const hook = await Webhook.findOne({ _id: id, tenantId });
    if (!hook) return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.url !== undefined) {
      try { new URL(body.url); } catch { return NextResponse.json({ success: false, error: 'Invalid URL' }, { status: 400 }); }
      updates.url = body.url.trim();
    }
    if (body.events !== undefined) {
      const valid = body.events.filter((e: string) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
      if (valid.length === 0) return NextResponse.json({ success: false, error: 'At least one valid event is required' }, { status: 400 });
      updates.events = valid;
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    const updated = await Webhook.findByIdAndUpdate(id, updates, { new: true }).select('-secret');

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'webhook',
      entityId: id,
      metadata: { updates },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to update webhook');
  }
}

/**
 * DELETE /api/webhooks/[id] — Delete a webhook
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const hook = await Webhook.findOneAndDelete({ _id: id, tenantId });
    if (!hook) return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'webhook',
      entityId: id,
      metadata: { name: hook.name },
    });

    return NextResponse.json({ success: true, data: { message: 'Webhook deleted' } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to delete webhook');
  }
}
