import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { SubscriptionService } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 404 }
      );
    }

    const subscriptionStatus = await SubscriptionService.getSubscriptionStatus(tenantId.toString());

    return NextResponse.json({
      success: true,
      data: subscriptionStatus
    });
  } catch (error: any) {
    console.error('Error fetching subscription status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}