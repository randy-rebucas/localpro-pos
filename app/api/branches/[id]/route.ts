import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';

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

    const branch = await getRepos().branches.findByIdWithManager(tenantId, id);

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

    const body = await request.json();
    const { name, code, address, phone, email, managerId, isActive } = body;

    const result = await getRepos().branches.update(tenantId, id, {
      name: name ? name : undefined,
      code,
      address,
      phone,
      email,
      managerId,
      isActive,
    });
    if (!result) {
      return NextResponse.json({ success: false, error: 'Branch not found' }, { status: 404 });
    }
    const branch = result.after;

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'branch',
      entityId: branch._id,
      changes: { before: result.before, after: result.after },
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

    // Soft delete - set isActive to false
    const result = await getRepos().branches.update(tenantId, id, { isActive: false });
    if (!result) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.DELETE,
      entityType: 'branch',
      entityId: result.after._id,
      changes: { name: result.after.name },
    });

    return NextResponse.json({ success: true, message: t('validation.branchDeactivated', 'Branch deactivated') });
  } catch (error) {
    return handleApiError(error, 'Failed to delete branch');
  }
}

