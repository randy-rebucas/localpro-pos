import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId, user } = await requireTenantAccess(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'subscriptions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:subscriptions-billing:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Get the current subscription for this tenant
    const subscription = await Subscription.findOne({ tenantId }).lean();

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // For now, we'll return the billing history from the subscription
    // In a real implementation, this would be a separate BillingHistory collection
    const billingHistory = subscription.billingHistory || [];

    // Transform the billing history to include proper date formatting
    const formattedHistory = billingHistory.map((billing: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      _id: billing._id,
      amount: billing.amount,
      currency: billing.currency || 'PHP',
      status: billing.status || 'paid',
      date: billing.date ?? billing.createdAt ?? null,
      transactionId: billing.transactionId,
      invoiceUrl: billing.invoiceUrl,
    }));

    return NextResponse.json({
      success: true,
      data: formattedHistory,
    });

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching billing history:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchBillingHistory', 'Failed to fetch billing history') },
      { status: 500 }
    );
  }
}