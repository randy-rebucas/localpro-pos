import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { checkFeatureAccess, checkSubscriptionLimit } from '@/lib/subscription';
import { normalizeBranchCode, resolveBranchManager } from '@/lib/branch-manager';

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

    const t = await getValidationTranslatorFromRequest(request);

    const branch = await Branch.findOne({ _id: id, tenantId });
    if (!branch) {
      return NextResponse.json({ success: false, error: t('validation.branchNotFound', 'Branch not found') }, { status: 404 });
    }

    const body = await request.json();
    const { address, phone, email, isActive } = body;
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const code = normalizeBranchCode(body.code);

    if (name === '') {
      return NextResponse.json({ success: false, error: t('validation.branchNameRequired', 'Branch name is required') }, { status: 400 });
    }

    const manager = await resolveBranchManager(body.managerId, tenantId);
    if (!manager.ok) {
      return NextResponse.json({ success: false, error: t('validation.branchManagerInvalid', 'The chosen manager is not a user of this store') }, { status: 400 });
    }

    if (code && (await Branch.exists({ tenantId, code: code.toUpperCase(), _id: { $ne: branch._id } }))) {
      return NextResponse.json({ success: false, error: t('validation.branchCodeTaken', 'Another branch already uses this code') }, { status: 409 });
    }

    // Reactivating counts against the plan the same way creating does, or deactivate,
    // create, reactivate would get around the branch limit.
    if (isActive === true && branch.isActive === false) {
      const activeCount = await Branch.countDocuments({ tenantId, isActive: true });
      try {
        if (activeCount >= 1) await checkFeatureAccess(tenantId.toString(), 'enableMultiBranch');
        await checkSubscriptionLimit(tenantId.toString(), 'maxBranches', activeCount);
      } catch (limitError) {
        return NextResponse.json(
          { success: false, error: limitError instanceof Error ? limitError.message : 'Branch limit reached' },
          { status: 403 }
        );
      }
    }

    const oldData = branch.toObject();

    if (name) branch.name = name;
    // Cleared fields arrive as null; unset them rather than store '' (the code index is unique per tenant).
    if (code !== undefined) branch.set('code', code ?? undefined);
    if (address !== undefined) branch.set('address', address ?? undefined);
    if (phone !== undefined) branch.set('phone', phone || undefined);
    if (email !== undefined) branch.set('email', email || undefined);
    if (manager.value !== undefined) branch.set('managerId', manager.value ?? undefined);
    if (typeof isActive === 'boolean') branch.isActive = isActive;

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

