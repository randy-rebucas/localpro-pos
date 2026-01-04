import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ProductBundle from '@/models/ProductBundle';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * Bulk operations for bundles (activate/deactivate)
 */
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { bundleIds, action } = body;

    if (!bundleIds || !Array.isArray(bundleIds) || bundleIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Bundle IDs array is required' },
        { status: 400 }
      );
    }

    if (!['activate', 'deactivate'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Action must be "activate" or "deactivate"' },
        { status: 400 }
      );
    }

    const isActive = action === 'activate';

    const result = await ProductBundle.updateMany(
      { _id: { $in: bundleIds }, tenantId },
      { $set: { isActive } }
    );

    // Create audit log for bulk operation
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: 'bulk',
      changes: {
        bundleIds,
        action,
        count: result.modifiedCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${result.modifiedCount} bundle(s) ${action}d successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: unknown) {
    console.error('Error in bulk bundle operation:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
