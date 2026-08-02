import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { listTables, createTable, fromPrismaTableStatus } from '@/lib/data/tables';

function serializeTable(table: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, ...rest } = table;
  return { _id: id, ...rest, status: fromPrismaTableStatus(rest.status) };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const isActiveParam = searchParams.get('isActive');
    const branchId = searchParams.get('branchId');
    const status = searchParams.get('status');

    let isActive: boolean | undefined;
    if (isActiveParam === null || isActiveParam === undefined) {
      isActive = true;
    } else if (isActiveParam === 'all') {
      isActive = undefined;
    } else {
      isActive = isActiveParam === 'true';
    }

    let statusFilter: string | undefined;
    if (status) {
      const validStatuses = ['open', 'occupied', 'check-requested'];
      if (validStatuses.includes(status)) {
        statusFilter = status;
      }
    }

    const tables = await listTables(tenantId, {
      isActive,
      branchId: branchId || undefined,
      status: statusFilter,
    });

    return NextResponse.json({ success: true, data: tables.map(serializeTable) });
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

    const table = await createTable({
      tenantId,
      name,
      capacity: capacity || undefined,
      branchId: branchId || undefined,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'table',
      entityId: table.id,
      changes: { name: table.name, capacity: table.capacity },
    });

    return NextResponse.json({ success: true, data: serializeTable(table) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create table');
  }
}
