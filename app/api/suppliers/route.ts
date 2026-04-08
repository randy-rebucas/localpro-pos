import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Supplier from '@/models/Supplier';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const search = request.nextUrl.searchParams.get('search');

    const query: Record<string, unknown> = { tenantId, isActive: true };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { contactName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const suppliers = await Supplier.find(query).sort({ name: 1 }).lean();
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to list suppliers');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);
    const body = await request.json();
    const { name, contactName, email, phone, address, leadTimeDays, paymentTerms, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    const supplier = await Supplier.create({
      tenantId,
      name: name.trim(),
      contactName,
      email,
      phone,
      address,
      leadTimeDays: leadTimeDays ?? 7,
      paymentTerms,
      notes,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'supplier',
      entityId: supplier._id.toString(),
      metadata: { name },
    });

    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to create supplier');
  }
}
