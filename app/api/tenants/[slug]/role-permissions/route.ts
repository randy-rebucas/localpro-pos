/**
 * Role Permission Overrides API
 * Per-tenant configuration of which viewer/cashier/manager-tier features are enabled.
 * Owner/admin/super_admin are never restricted and cannot be overridden.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { PERMISSIONS, OVERRIDABLE_ROLES, type RolePermissionOverrides } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const rl = checkRateLimit(`role-permissions-get:${slug}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'roles_permissions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const override = await prisma.tenantRolePermissionOverride.findUnique({ where: { tenantId: tenant.id } });

    return NextResponse.json({
      success: true,
      data: {
        overrides: (override?.overrides as RolePermissionOverrides | undefined) || {},
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
    const { slug } = await params;
    const rl = checkRateLimit(`role-permissions-put:${slug}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'roles_permissions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

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

    const tenant = await prisma.tenant.findFirst({ where: { slug } });
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.tenantId !== tenant.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const previousRecord = await prisma.tenantRolePermissionOverride.findUnique({ where: { tenantId: tenant.id } });
    const previous = (previousRecord?.overrides as RolePermissionOverrides | undefined) || {};

    await prisma.tenantRolePermissionOverride.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, overrides: sanitized },
      update: { overrides: sanitized },
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: user.userId,
      action: AuditActions.UPDATE,
      entityType: 'role_permissions',
      entityId: tenant.id,
      changes: { before: previous, after: sanitized },
    });

    return NextResponse.json({ success: true, data: { overrides: sanitized } });
  } catch (error) {
    logger.error('Error updating role permission overrides:', error);
    const message = error instanceof Error ? error.message : 'Failed to update role permissions';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
