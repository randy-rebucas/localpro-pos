import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Table from '@/models/Table';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');
    const branchId = searchParams.get('branchId');
    const status = searchParams.get('status');

    const query: Record<string, unknown> = { tenantId };
    
    // Filter by active status (default to active only)
    if (isActive === null || isActive === undefined) {
      query.isActive = true;
    } else if (isActive === 'all') {
      // No filter
    } else {
      query.isActive = isActive === 'true';
    }

    if (branchId) {
      query.branchId = branchId;
    }

    if (status) {
      const validStatuses = ['open', 'occupied', 'check-requested'];
      if (validStatuses.includes(status)) {
        query.status = status;
      }
    }

    const tables = await Table.find(query).sort({ name: 1 }).lean();

    return NextResponse.json({ success: true, data: tables });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tables');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

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

    const table = await Table.create({
      tenantId,
      name,
      capacity: capacity || undefined,
      branchId: branchId || undefined,
      status: 'open',
      isActive: true,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'table',
      entityId: table._id.toString(),
      changes: { name: table.name, capacity: table.capacity },
    });

    return NextResponse.json({ success: true, data: table }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create table');
  }
}
