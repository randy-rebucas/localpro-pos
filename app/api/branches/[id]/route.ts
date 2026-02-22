import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const branch = await Branch.findOne({ _id: id, tenantId })
      .populate('managerId', 'name email')
      .lean();

    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: branch });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error fetching branch:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const t = await getValidationTranslatorFromRequest(request);
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: t('validation.branchCodeExists', 'Branch with this code already exists') },
        { status: 400 }
      );
    }
    console.error('Error updating branch:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('Error deleting branch:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

