import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import type { Prisma, TableStatus } from '@prisma/client';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getTenantSettingsById } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'tables.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');
    const branchId = searchParams.get('branchId');
    const status = searchParams.get('status');

    const where: Prisma.PosTableWhereInput = { tenantId };

    // Filter by active status (default to active only)
    if (isActive === null || isActive === undefined) {
      where.isActive = true;
    } else if (isActive === 'all') {
      // No filter
    } else {
      where.isActive = isActive === 'true';
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (status) {
      const validStatuses = ['open', 'occupied', 'check-requested'];
      if (validStatuses.includes(status)) {
        where.status = status as TableStatus;
      }
    }

    const tables = await prisma.posTable.findMany({ where, orderBy: { name: 'asc' } });

    return NextResponse.json({ success: true, data: tables });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tables');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'tables.configure'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const tenantSettings = await getTenantSettingsById(tenantId);
    if (tenantSettings?.enableTableManagement === false) {
      return NextResponse.json(
        { success: false, error: 'Table management is turned off for this store. Enable it under Settings → Feature Flags.' },
        { status: 403 }
      );
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tables:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    let { name, capacity } = body;
    const { branchId } = body;

    // Input validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, error: 'Table name is required' }, { status: 400 });
    }

    name = name.trim();
    if (name.length > 50) {
      return NextResponse.json({ success: false, error: 'Table name must not exceed 50 characters' }, { status: 400 });
    }

    if (capacity !== undefined && capacity !== null) {
      const cap = Number(capacity);
      if (isNaN(cap) || cap < 1 || cap > 100) {
        return NextResponse.json({ success: false, error: 'Capacity must be a number between 1 and 100' }, { status: 400 });
      }
      capacity = cap;
    }

    const table = await prisma.posTable.create({
      data: {
        id: randomUUID(),
        tenantId,
        name,
        capacity: capacity || undefined,
        branchId: branchId || undefined,
        status: 'open',
        isActive: true,
      },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'table',
      entityId: table.id,
      changes: { name: table.name, capacity: table.capacity },
    });

    return NextResponse.json({ success: true, data: table }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create table');
  }
}
