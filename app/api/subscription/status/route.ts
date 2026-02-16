import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { SubscriptionService } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  try {
    // Require authentication to check subscription status
    const user = await requireAuth(request);
    const tenantId = user.tenantId;

    const subscriptionStatus = await SubscriptionService.getSubscriptionStatus(tenantId.toString());

    return NextResponse.json({
      success: true,
      data: subscriptionStatus
    });
  } catch (error: unknown) {
    if ((error as Error).message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    console.error('Error fetching subscription status:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription status' },
      { status: 500 }
    );
  }
}