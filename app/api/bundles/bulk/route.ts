import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { bulkSetBundlesActive } from '@/lib/data/bundles';

/**
 * Bulk operations for bundles (activate/deactivate)
 */
export async function PUT(request: NextRequest) {
  try {
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

    const modifiedCount = await bulkSetBundlesActive(tenantId, bundleIds, isActive);

    // Create audit log for bulk operation
    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'bundle',
      entityId: 'bulk',
      changes: {
        bundleIds,
        action,
        count: modifiedCount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${modifiedCount} bundle(s) ${action}d successfully`,
      modifiedCount,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error in bulk bundle operation:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
