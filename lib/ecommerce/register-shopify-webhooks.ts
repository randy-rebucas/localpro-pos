import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { shopifyRegisterWebhook } from '@/lib/ecommerce/shopify-api';
import type { ITenantEcommerceIntegration } from '@/models/TenantEcommerceIntegration';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { logger } from '@/lib/logger';

const TOPICS = ['orders/paid', 'orders/updated'] as const;

export async function registerShopifyWebhooksForIntegration(
  integration: ITenantEcommerceIntegration,
  options?: { publicAppBaseUrl?: string }
): Promise<void> {
  const shop = integration.shopDomain;
  if (!shop) return;
  const accessToken = await getShopifyAccessTokenForIntegration(integration);
  const base = options?.publicAppBaseUrl ?? getPublicAppUrl();
  const address = `${base}/api/webhooks/shopify`;
  for (const topic of TOPICS) {
    const w = await shopifyRegisterWebhook(shop, accessToken, topic, address);
    if (!w) logger.warn('Shopify webhook registration failed', { topic, shop });
  }
}
