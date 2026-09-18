import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { tenantId, user } = await requireTenantAccess(request);

    if (!(await hasTenantPermission(user.role, tenantId, 'subscriptions.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`read:subscriptions-billing:${tenantId}:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // Get the current subscription for this tenant, with its normalized
    // billing history child rows.
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        billingHistory: { orderBy: { date: 'desc' } },
      },
    });

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // Transform the billing history to include proper date formatting
    const formattedHistory = subscription.billingHistory.map((billing) => ({
      _id: billing.id,
      amount: billing.amount,
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

  } catch (error: unknown) {
    logger.error('Error fetching billing history:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: (error as Error).message || t('validation.failedToFetchBillingHistory', 'Failed to fetch billing history') },
      { status: 500 }
    );
  }
}
