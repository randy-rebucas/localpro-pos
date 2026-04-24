import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { parseShopifyOrderWebhook } from '@/lib/ecommerce/parse-shopify-order';
import { parseWooCommerceOrderWebhook } from '@/lib/ecommerce/parse-woo-order';
import { importPaidChannelOrder } from '@/lib/ecommerce/import-channel-order';
import { logger } from '@/lib/logger';

export async function handleShopifyWebhook(
  shopDomainHeader: string | null,
  topic: string | null,
  rawBody: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  await connectDB();
  const shop = (shopDomainHeader || '').toLowerCase().trim();
  if (!shop) return { status: 401, body: 'missing shop' };

  const integration = await TenantEcommerceIntegration.findOne({
    provider: 'shopify',
    shopDomain: shop,
    isActive: true,
  });
  if (!integration) {
    return { status: 404, body: 'unknown shop' };
  }

  const tenantId = integration.tenantId.toString();

  if (topic?.startsWith('orders/')) {
    const order = parseShopifyOrderWebhook(payload);
    if (order) {
      const r = await importPaidChannelOrder(tenantId, order);
      if (!r.ok && !r.duplicate) {
        logger.warn('Shopify order import skipped', { reason: r.reason, tenantId });
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
  await connectDB();
  const integration = await TenantEcommerceIntegration.findOne({
    _id: integrationId,
    provider: 'woocommerce',
    isActive: true,
  });
  if (!integration) return { status: 404, body: 'unknown integration' };

  const order = parseWooCommerceOrderWebhook(payload);
  if (order) {
    const r = await importPaidChannelOrder(integration.tenantId.toString(), order);
    if (!r.ok && !r.duplicate) {
      logger.warn('Woo order import skipped', { reason: r.reason, integrationId });
    }
  }

  return { status: 200, body: 'ok' };
}
