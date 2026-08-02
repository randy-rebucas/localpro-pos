import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { logger } from '@/lib/logger';
import { getSubscriptionByTenantIdWithBillingHistory } from '@/lib/data/subscriptions';

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
    const subscription = await getSubscriptionByTenantIdWithBillingHistory(tenantId);

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // For now, we'll return the billing history from the subscription
    const billingHistory = subscription.billingHistory || [];

    // Transform the billing history to include proper date formatting
    const formattedHistory = billingHistory.map((billing) => ({
      _id: billing.id,
      amount: Number(billing.amount),
      currency: billing.currency || 'PHP',
      status: billing.status || 'paid',
      date: billing.date ?? null,
      transactionId: billing.transactionId,
      invoiceUrl: billing.invoiceUrl,
    }));

    return NextResponse.json({
      success: true,
      data: formattedHistory,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching billing history:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
