import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ApiKey from '@/models/ApiKey';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

/**
 * DELETE /api/api-keys/[id] — Revoke (soft-delete) an API key
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const { id } = await params;

    const apiKey = await ApiKey.findOne({ _id: id, tenantId });
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 });
    }

    await ApiKey.findByIdAndUpdate(id, { isActive: false });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'api_key',
      entityId: id,
      metadata: { name: apiKey.name },
    });

    return NextResponse.json({ success: true, data: { message: 'API key revoked' } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to revoke API key');
  }
}
