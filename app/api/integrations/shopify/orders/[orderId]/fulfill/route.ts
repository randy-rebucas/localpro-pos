import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { requireEcommerceIntegrationFeature } from '@/lib/ecommerce/require-ecommerce-feature';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { createShopifyFulfillment } from '@/lib/ecommerce/shopify-fulfillment';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const t = await getValidationTranslatorFromRequest(request);
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ success: false, error: t('validation.unauthorized', 'Unauthorized') }, { status: 401 });
    if (!(await hasTenantPermission(user.role, user.tenantId, 'integrations.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden') }, { status: 403 });
    }

    const rl = checkRateLimit(`shopify-fulfill:${user.tenantId}`, 20, 60_000);
    if (!rl.allowed) return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });

    await requireEcommerceIntegrationFeature(user.tenantId);

    const { orderId } = await params;
    const body = await request.json().catch(() => ({}));
    const { trackingNumber, trackingCompany } = body as { trackingNumber?: string; trackingCompany?: string };

    const integration = await getRepos().ecommerceIntegrations.findActive(user.tenantId, 'shopify');
    if (!integration?.shopDomain) {
      return NextResponse.json({ success: false, error: t('validation.noActiveShopifyIntegration', 'No active Shopify integration') }, { status: 400 });
    }

    // Idempotency guard: if the local transaction already recorded a Shopify
    // fulfillment for this order, don't call Shopify again on a double-click/retry.
    const existingTransaction = await getRepos().transactions.findOne(user.tenantId, {
      externalOrderId: orderId,
      salesChannel: 'shopify',
    });
    if (existingTransaction?.shopifyFulfilledAt) {
      return NextResponse.json({
        success: true,
        data: { fulfillmentId: existingTransaction.shopifyFulfillmentId, alreadyFulfilled: true },
      });
    }

    const accessToken = await getShopifyAccessTokenForIntegration(integration);
    const { fulfillmentId } = await createShopifyFulfillment(
      integration.shopDomain,
      accessToken,
      orderId,
      trackingNumber,
      trackingCompany
    );

    // Shopify fulfillment already succeeded at this point — the local sync below
    // is best-effort. A failure here must not report the fulfillment itself as failed.
    try {
      await getRepos().transactions.markShopifyFulfilled(user.tenantId, orderId, fulfillmentId, new Date());

      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: AuditActions.UPDATE,
        entityType: 'shopify_order',
        entityId: orderId,
        changes: { fulfillmentId, trackingNumber, trackingCompany },
      });
    } catch (syncError: unknown) {
      logger.error('Shopify order fulfilled but local sync failed:', syncError);
    }

    return NextResponse.json({ success: true, data: { fulfillmentId } });
  } catch (error: unknown) {
    return handleApiError(error, t('validation.failedToFulfillShopifyOrder', 'Failed to fulfill Shopify order'));
  }
}
