import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
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

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableLoyaltyProgram');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const [result, enrolledCount] = await Promise.all([
      prisma.customer.aggregate({
        where: { tenantId, loyaltyPointsBalance: { gt: 0 } },
        _sum: { loyaltyPointsBalance: true },
      }),
      prisma.customer.count({ where: { tenantId, loyaltyPointsBalance: { gt: 0 } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        enrolledCount,
        totalPoints: result._sum.loyaltyPointsBalance ?? 0,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch loyalty stats');
  }
}
