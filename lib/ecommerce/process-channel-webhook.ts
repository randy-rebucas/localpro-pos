import prisma from '@/lib/prisma';
import { parseShopifyOrderWebhook } from '@/lib/ecommerce/parse-shopify-order';
import { parseShopifyRefundWebhook } from '@/lib/ecommerce/parse-shopify-refund';
import { parseWooCommerceOrderWebhook } from '@/lib/ecommerce/parse-woo-order';
import { importPaidChannelOrder } from '@/lib/ecommerce/import-channel-order';
import { updateStock } from '@/lib/stock';
import { STOCK_REASON_CHANNEL_REFUND } from '@/lib/ecommerce/constants';
import { logger } from '@/lib/logger';

export async function handleShopifyWebhook(
  shopDomainHeader: string | null,
  topic: string | null,
  rawBody: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const shop = (shopDomainHeader || '').toLowerCase().trim();
  if (!shop) return { status: 401, body: 'missing shop' };

  const integration = await prisma.tenantEcommerceIntegration.findFirst({
    where: { provider: 'shopify', shopDomain: shop, isActive: true },
  });
  if (!integration) {
    return { status: 404, body: 'unknown shop' };
  }

  const tenantId = integration.tenantId;

  if (topic?.startsWith('orders/')) {
    const order = parseShopifyOrderWebhook(payload);
    if (order) {
      const r = await importPaidChannelOrder(tenantId, order);
      if (!r.ok && !r.duplicate) {
        logger.warn('Shopify order import skipped', { reason: r.reason, tenantId });
      }
    }
  } else if (topic === 'refunds/create') {
    const refund = parseShopifyRefundWebhook(payload);
    if (refund) {
      // Restock each refunded line — look up productId via ProductChannelListing
      for (const line of refund.lines) {
        try {
          const listing = await prisma.productChannelListing.findFirst({
            where: { tenantId, provider: 'shopify', externalVariantId: line.externalVariantId },
          });
          if (!listing) continue;
          await updateStock(listing.productId, tenantId, line.quantity, 'return', {
            reason: STOCK_REASON_CHANNEL_REFUND,
            notes: `Shopify refund on order ${refund.externalOrderId}`,
          });
        } catch (err) {
          logger.error('Shopify refund restock failed', { variantId: line.externalVariantId, err });
        }
      }
    }
  }

  return { status: 200, body: 'ok' };
}

export async function handleWooCommerceWebhook(
  integrationId: string,
  rawBody: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const integration = await prisma.tenantEcommerceIntegration.findFirst({
    where: { id: integrationId, provider: 'woocommerce', isActive: true },
  });
  if (!integration) return { status: 404, body: 'unknown integration' };

  const order = parseWooCommerceOrderWebhook(payload);
  if (order) {
    const r = await importPaidChannelOrder(integration.tenantId, order);
    if (!r.ok && !r.duplicate) {
      logger.warn('Woo order import skipped', { reason: r.reason, integrationId });
    }
  }

  return { status: 200, body: 'ok' };
}
