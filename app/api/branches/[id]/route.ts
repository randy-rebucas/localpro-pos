import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const branch = await Branch.findOne({ _id: id, tenantId })
      .populate('managerId', 'name email')
      .lean();

    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: branch });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch branch');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:branches:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const branch = await Branch.findOne({ _id: id, tenantId });
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, address, phone, email, managerId, isActive } = body;

    const oldData = branch.toObject();

    if (name) branch.name = name;
    if (code !== undefined) branch.code = code;
    if (address !== undefined) branch.address = address;
    if (phone !== undefined) branch.phone = phone;
    if (email !== undefined) branch.email = email;
    if (managerId !== undefined) branch.managerId = managerId;
    if (isActive !== undefined) branch.isActive = isActive;

    await branch.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'branch',
      entityId: branch._id.toString(),
      changes: { before: oldData, after: branch.toObject() },
    });

    return NextResponse.json({ success: true, data: branch });
  } catch (error) {
    return handleApiError(error, 'Failed to update branch');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:branches:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const branch = await Branch.findOne({ _id: id, tenantId });
    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    branch.isActive = false;
    await branch.save();

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'branch',
      entityId: branch._id.toString(),
      changes: { name: branch.name },
    });

    return NextResponse.json({ success: true, message: t('validation.branchDeactivated', 'Branch deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete branch');
  }
}

