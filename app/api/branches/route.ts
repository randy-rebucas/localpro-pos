import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, checkFeatureAccess, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/error-handler';
import { listBranches, countActiveBranches, createBranch } from '@/lib/data/branches';

function serializeBranch(branch: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { id, manager, ...rest } = branch;
  return {
    _id: id,
    ...rest,
    managerId: manager ? { _id: manager.id, name: manager.name, email: manager.email } : rest.managerId,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;

    const searchParams = request.nextUrl.searchParams;
    const isActive = searchParams.get('isActive');

    const branches = await listBranches(
      tenantId,
      searchParams.has('isActive') ? isActive === 'true' : undefined
    );

    return NextResponse.json({ success: true, data: branches.map(serializeBranch) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch branches');
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId, user } = authResult;
    if (!(await hasTenantPermission(user.role, tenantId, 'branches.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }
    const t = await getValidationTranslatorFromRequest(request);

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:branches:${tenantId}:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { name, code, address, phone, email, managerId } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: t('validation.branchNameRequired', 'Branch name is required') }, { status: 400 });
    }

    // Check if multi-branch feature is enabled (skip for first branch)
    const currentBranchCount = await countActiveBranches(tenantId);
    if (currentBranchCount >= 1) {
      try {
        await checkFeatureAccess(tenantId.toString(), 'enableMultiBranch');
      } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        return NextResponse.json(
          { success: false, error: featureError.message },
          { status: 403 }
        );
      }
    }

    // Check subscription limits
    try {
      await checkSubscriptionLimit(tenantId.toString(), 'maxBranches', currentBranchCount);
    } catch (limitError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: limitError.message },
        { status: 403 }
      );
    }

    const branch = await createBranch({
      tenantId,
      name,
      code,
      address,
      phone,
      email,
      managerId,
    });

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.CREATE,
      entityType: 'branch',
      entityId: branch.id,
      changes: body,
    });

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        branches: currentBranchCount + 1
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: { _id: branch.id, ...branch } }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create branch');
  }
}
