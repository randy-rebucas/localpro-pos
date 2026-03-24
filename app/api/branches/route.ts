import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Branch from '@/models/Branch';
import { requireTenantAccess } from '@/lib/api-tenant';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkSubscriptionLimit, checkFeatureAccess, SubscriptionService } from '@/lib/subscription';
import { logger } from '@/lib/logger';
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

    const query: any = { tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (searchParams.has('isActive')) {
      query.isActive = isActive === 'true';
    }

    const branches = await Branch.find(query)
      .populate('managerId', 'name email')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, data: branches });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch branches');
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const authResult = await requireTenantAccess(request);
    if (authResult instanceof NextResponse) return authResult;
    const { tenantId } = authResult;
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
    const currentBranchCount = await Branch.countDocuments({ tenantId, isActive: true });
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

    // Update subscription usage
    try {
      await SubscriptionService.updateUsage(tenantId.toString(), {
        branches: currentBranchCount + 1
      });
    } catch (usageError) {
      logger.error('Failed to update subscription usage:', usageError);
      // Don't fail the request if usage update fails
    }

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Failed to create branch');
  }
}

