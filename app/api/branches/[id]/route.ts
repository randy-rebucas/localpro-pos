import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { getBranchById, updateBranch } from '@/lib/data/branches';

function serializeBranch(branch: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, manager, ...rest } = branch;
  return {
    _id: id,
    ...rest,
    managerId: manager ? { _id: manager.id, name: manager.name, email: manager.email } : rest.managerId,
  };
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
    const t = await getValidationTranslatorFromRequest(request);

    const branch = await getBranchById(id, tenantId);

    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeBranch(branch) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch branch');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'branches.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:branches:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const oldBranch = await getBranchById(id, tenantId);
    if (!oldBranch) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, address, phone, email, managerId, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (managerId !== undefined) updateData.managerId = managerId;
    if (isActive !== undefined) updateData.isActive = isActive;

    const branch = await updateBranch(id, tenantId, updateData);
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'branch',
      entityId: branch.id,
      changes: { before: oldBranch, after: branch },
    });

    return NextResponse.json({ success: true, data: { _id: branch.id, ...branch } });
  } catch (error) {
    return handleApiError(error, 'Failed to update branch');
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
    if (!(await hasTenantPermission(user.role, tenantId, 'branches.delete'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:branches:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const existing = await getBranchById(id, tenantId);
    if (!existing) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    const branch = await updateBranch(id, tenantId, { isActive: false });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'branch',
      entityId: id,
      changes: { name: branch?.name },
    });

    return NextResponse.json({ success: true, message: t('validation.branchDeactivated', 'Branch deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete branch');
  }
}
