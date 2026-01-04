import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');

    const query: Record<string, unknown> = { tenantId };
    if (isActive !== null) {
      query.isActive = isActive === 'true';
    }

    const branches = await Branch.find(query)
      .populate('managerId', 'name email')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: branches });
  } catch (error: unknown) {
    console.error('Error fetching branches:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, address, phone, email, managerId } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: t('validation.branchNameRequired', 'Branch name is required') }, { status: 400 });
    }

    const branch = await Branch.create({
      tenantId,
      name,
      code,
      address,
      phone,
      email,
      managerId,
      isActive: true,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'branch',
      entityId: branch._id.toString(),
      changes: body,
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error: unknown) {
    const t = await getValidationTranslatorFromRequest(request);
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.branchCodeExists', 'Branch with this code already exists') },
        { status: 400 }
      );
    }
    console.error('Error creating branch:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

