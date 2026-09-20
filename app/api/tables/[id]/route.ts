import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { TableStatus } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { requireTableManagementAccess } from '@/lib/table-management-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;

    const table = await prisma.posTable.findFirst({ where: { id, tenantId } });
    if (!table) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: table });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch table');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    const { id } = await params;

    const body = await request.json();
    let { name, capacity } = body;
    const { status, isActive, currentOrderId } = body;

    // Renaming, resizing, or (de)activating a table is floor-plan configuration
    // (tables.configure, manager+); changing status/currentOrderId is ordinary
    // POS table service any staff with tables.manage (cashier+) already does.
    const isConfigChange = name !== undefined || capacity !== undefined || isActive !== undefined;
    const requiredPermission = isConfigChange ? 'tables.configure' : 'tables.manage';
    if (!(await hasTenantPermission(user.role, tenantId, requiredPermission))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    if (isConfigChange) {
      try {
        await requireTableManagementAccess(tenantId);
      } catch (featureError: unknown) {
        const msg = featureError instanceof Error ? featureError.message : 'Forbidden';
        return NextResponse.json({ success: false, error: msg }, { status: 403 });
      }
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tables:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const table = await prisma.posTable.findFirst({ where: { id, tenantId } });
    if (!table) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    // Input validation
    if (name !== undefined && name !== null) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ success: false, error: 'Table name cannot be empty' }, { status: 400 });
      }
      name = name.trim();
      if (name.length > 50) {
        return NextResponse.json({ success: false, error: 'Table name must not exceed 50 characters' }, { status: 400 });
      }
    }

    if (capacity !== undefined && capacity !== null) {
      const cap = Number(capacity);
      if (isNaN(cap) || cap < 1 || cap > 100) {
        return NextResponse.json({ success: false, error: 'Capacity must be a number between 1 and 100' }, { status: 400 });
      }
      capacity = cap;
    }

    if (status !== undefined && status !== null) {
      const validStatuses = ['open', 'occupied', 'check-requested'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ success: false, error: `Status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
      }
    }

    const oldData = table;

    const updated = await prisma.posTable.update({
      where: { id: table.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
        ...(status !== undefined ? { status: status as TableStatus } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(currentOrderId !== undefined ? { currentOrderId: currentOrderId || null } : {}),
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'table',
      entityId: table.id,
      changes: { before: oldData, after: updated },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, 'Failed to update table');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    const { id } = await params;

    if (!(await hasTenantPermission(user.role, tenantId, 'tables.configure'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tables:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const table = await prisma.posTable.findFirst({ where: { id, tenantId } });
    if (!table) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    await prisma.posTable.update({ where: { id: table.id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'table',
      entityId: table.id,
      changes: { name: table.name },
    });

    return NextResponse.json({ success: true, message: 'Table deactivated' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete table');
  }
}
