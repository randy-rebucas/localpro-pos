import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getTableById, updateTable, toPrismaTableStatus, fromPrismaTableStatus } from '@/lib/data/tables';

function serializeTable(table: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, ...rest } = table;
  return { _id: id, ...rest, status: fromPrismaTableStatus(rest.status) };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;

    const table = await getTableById(id, tenantId);
    if (!table) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeTable(table) });
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
    const { tenantId } = authResult;
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tables:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const oldTable = await getTableById(id, tenantId);
    if (!oldTable) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    const body = await request.json();
    let { name, capacity } = body;
    const { status, isActive, currentOrderId } = body;

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

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (status !== undefined) updateData.status = toPrismaTableStatus(status);
    if (isActive !== undefined) updateData.isActive = isActive;
    if (currentOrderId !== undefined) updateData.currentOrderId = currentOrderId || null;

    const table = await updateTable(id, tenantId, updateData);
    if (!table) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'table',
      entityId: table.id,
      changes: { before: oldTable, after: table },
    });

    return NextResponse.json({ success: true, data: serializeTable(table) });
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
    const { tenantId } = authResult;
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:tables:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const existing = await getTableById(id, tenantId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
    }

    const table = await updateTable(id, tenantId, { isActive: false });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'table',
      entityId: id,
      changes: { name: table?.name },
    });

    return NextResponse.json({ success: true, message: 'Table deactivated' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete table');
  }
}
