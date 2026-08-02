import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { shopifyRegisterWebhook } from '@/lib/ecommerce/shopify-api';
import { getShopifyAccessTokenForIntegration } from '@/lib/ecommerce/shopify-token';
import { logger } from '@/lib/logger';

const TOPICS = ['orders/paid', 'orders/updated', 'refunds/create', 'products/update'] as const;

export async function registerShopifyWebhooksForIntegration(
  integration: { id: string; credentialsEncrypted: string; shopDomain: string | null },
  options?: { publicAppBaseUrl?: string }
): Promise<void> {
  const shop = integration.shopDomain;
  if (!shop) return;
  const accessToken = await getShopifyAccessTokenForIntegration({ _id: integration.id, credentialsEncrypted: integration.credentialsEncrypted, shopDomain: integration.shopDomain });
  const base = options?.publicAppBaseUrl ?? getPublicAppUrl();
  const address = `${base}/api/webhooks/shopify`;
  for (const topic of TOPICS) {
    const w = await shopifyRegisterWebhook(shop, accessToken, topic, address);
    if (!w) logger.warn('Shopify webhook registration failed', { topic, shop });
  }
}
