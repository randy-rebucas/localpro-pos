import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkFeatureAccess } from '@/lib/subscription';
import { handleApiError } from '@/lib/error-handler';

/**
 * Tenant-wide loyalty totals (enrolled customer count, points outstanding).
 * Computed via aggregation across all customers, not just the current page —
 * the admin customer list is paginated, so summing balances client-side over
 * one page would silently undercount for tenants with more than a page of customers.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'loyalty.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const result = await prisma.customer.aggregate({
      where: { tenantId, loyaltyPointsBalance: { gt: 0 } },
      _count: { _all: true },
      _sum: { loyaltyPointsBalance: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        enrolledCount: result._count._all ?? 0,
        totalPoints: Number(result._sum.loyaltyPointsBalance ?? 0),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch loyalty stats');
  }
}
