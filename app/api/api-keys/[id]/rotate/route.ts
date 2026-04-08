import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ApiKey from '@/models/ApiKey';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import crypto from 'crypto';

/**
 * POST /api/api-keys/[id]/rotate — Rotate an API key (invalidate old, generate new)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const { id } = await params;

    const existing = await ApiKey.findOne({ _id: id, tenantId, isActive: true });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 });
    }

    // Revoke old key
    await ApiKey.findByIdAndUpdate(id, { isActive: false });

    // Generate new key
    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 15);

    const newApiKey = await ApiKey.create({
      name: existing.name,
      keyHash,
      keyPrefix,
      permissions: existing.permissions,
      tenantId,
      createdBy: userId,
      expiresAt: existing.expiresAt,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'api_key',
      entityId: id,
      metadata: { action: 'rotated', newKeyId: newApiKey._id.toString() },
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: newApiKey._id,
        name: newApiKey.name,
        key: rawKey,
        keyPrefix,
        permissions: newApiKey.permissions,
        message: 'Store this key securely — it will not be shown again.',
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to rotate API key');
  }
}
