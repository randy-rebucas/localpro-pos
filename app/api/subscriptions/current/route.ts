import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { logger } from '@/lib/logger';
import { getSubscriptionByTenantIdWithPlan, subscriptionToApi } from '@/lib/data/subscriptions';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const user = await requireAuth(request); // eslint-disable-line @typescript-eslint/no-unused-vars
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // Get the current subscription for this tenant
    const subscription = await getSubscriptionByTenantIdWithPlan(tenantId);

    return NextResponse.json({
      success: true,
      data: subscription ? subscriptionToApi(subscription) : null,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching current subscription:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
