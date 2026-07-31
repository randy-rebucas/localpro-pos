/**
 * Role Permission Overrides API
 * Per-tenant configuration of which viewer/cashier/manager-tier features are enabled.
 * Owner/admin/super_admin are never restricted and cannot be overridden.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { PERMISSIONS, OVERRIDABLE_ROLES, type RolePermissionOverrides } from '@/lib/permissions';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    await connectDB();

    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        overrides: tenant.settings?.rolePermissionOverrides || {},
        permissions: PERMISSIONS,
        overridableRoles: OVERRIDABLE_ROLES,
      },
    });
  } catch (error) {
    logger.error('Error fetching role permission overrides:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch role permissions';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'roles_permissions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const { slug } = await params;
    const body = await request.json();
    const overrides = body?.overrides as RolePermissionOverrides | undefined;

    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return NextResponse.json({ success: false, error: 'overrides object is required' }, { status: 400 });
    }

    // Validate shape: only overridable roles, only known permission keys, only booleans.
    const validKeys = new Set(PERMISSIONS.map((p) => p.key));
    const sanitized: RolePermissionOverrides = {};
    for (const role of OVERRIDABLE_ROLES) {
      const roleOverrides = overrides[role];
      if (!roleOverrides || typeof roleOverrides !== 'object') continue;
      const cleanRole: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(roleOverrides)) {
        if (validKeys.has(key) && typeof value === 'boolean') {
          cleanRole[key] = value;
        }
      }
      if (Object.keys(cleanRole).length > 0) {
        sanitized[role] = cleanRole;
      }
    }

    await connectDB();

    const tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant._id.toString()) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const previous = tenant.settings?.rolePermissionOverrides || {};
    tenant.settings.rolePermissionOverrides = sanitized;
    tenant.markModified('settings.rolePermissionOverrides');
    await tenant.save();

    await createAuditLog(request, {
      tenantId: tenant._id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'role_permissions',
      entityId: tenant._id.toString(),
      changes: { before: previous, after: sanitized },
    });

    return NextResponse.json({ success: true, data: { overrides: sanitized } });
  } catch (error) {
    logger.error('Error updating role permission overrides:', error);
    const message = error instanceof Error ? error.message : 'Failed to update role permissions';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
