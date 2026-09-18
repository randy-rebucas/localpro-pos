import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

function toBranchResponse(branch: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { street, city, state, zipCode, country, manager, ...rest } = branch;
  return {
    ...rest,
    address: { street, city, state, zipCode, country },
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

    const branch = await prisma.branch.findFirst({
      where: { id, tenantId },
      include: { manager: { select: { name: true, email: true } } },
    });

    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toBranchResponse(branch) });
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

    const oldBranch = await prisma.branch.findFirst({ where: { id, tenantId } });
    if (!oldBranch) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, code, address, phone, email, managerId, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (address !== undefined) {
      updateData.street = address?.street;
      updateData.city = address?.city;
      updateData.state = address?.state;
      updateData.zipCode = address?.zipCode;
      updateData.country = address?.country;
    }
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (managerId !== undefined) updateData.managerId = managerId || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const branch = await prisma.branch.update({
      where: { id },
      data: updateData,
      include: { manager: { select: { name: true, email: true } } },
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'branch',
      entityId: branch.id,
      changes: { before: oldBranch, after: branch },
    });

    return NextResponse.json({ success: true, data: toBranchResponse(branch) });
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

    const branch = await prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    // Soft delete - set isActive to false
    await prisma.branch.update({ where: { id }, data: { isActive: false } });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'branch',
      entityId: branch.id,
      changes: { name: branch.name },
    });

    return NextResponse.json({ success: true, message: t('validation.branchDeactivated', 'Branch deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete branch');
  }
}
