import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ApiKey from '@/models/ApiKey';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';
import crypto from 'crypto';

const ALL_PERMISSIONS = [
  'transactions:read', 'transactions:write',
  'products:read', 'products:write',
  'customers:read', 'customers:write',
  'bookings:read', 'bookings:write',
  'inventory:read', 'inventory:write',
  'reports:read',
  'webhooks:read', 'webhooks:write',
];

/**
 * GET /api/api-keys — List all API keys for the tenant
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);

    const keys = await ApiKey.find({ tenantId, isActive: true })
      .select('-keyHash')
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: keys });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list API keys');
  }
}

/**
 * POST /api/api-keys — Create a new API key
 * Returns the full key once — not stored in plain text
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);
    const userId = user.userId;
    const body = await request.json();
    const { name, permissions = ALL_PERMISSIONS, expiresAt } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    // Generate a secure random API key: sk_live_<32 random hex chars>
    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 15); // "sk_live_" + first 7 chars

    const apiKey = await ApiKey.create({
      name: name.trim(),
      keyHash,
      keyPrefix,
      permissions: permissions.filter((p: string) => ALL_PERMISSIONS.includes(p)),
      tenantId,
      createdBy: userId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'api_key',
      entityId: apiKey._id.toString(),
      metadata: { name, permissions },
    });

    return NextResponse.json({
      success: true,
      data: {
        _id: apiKey._id,
        name: apiKey.name,
        key: rawKey, // Only returned once
        keyPrefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        message: 'Store this key securely — it will not be shown again.',
      },
    }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create API key');
  }
}
