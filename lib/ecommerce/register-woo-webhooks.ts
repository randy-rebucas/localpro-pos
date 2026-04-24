import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { wooFetchJson } from '@/lib/ecommerce/woocommerce-api';
import type { ITenantEcommerceIntegration } from '@/models/TenantEcommerceIntegration';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { logger } from '@/lib/logger';

export async function registerWooCommerceWebhooks(
  integration: ITenantEcommerceIntegration,
  signingSecretPlain: string
): Promise<void> {
  const site = integration.siteUrl;
  if (!site) return;
  const cred = getWooCommerceCredentials(integration);
  const delivery = `${getPublicAppUrl()}/api/webhooks/woocommerce/${integration._id.toString()}`;
  try {
    await wooFetchJson(site, cred.consumerKey, cred.consumerSecret, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: 'LocalPro POS order sync',
        topic: 'order.updated',
        delivery_url: delivery,
        secret: signingSecretPlain,
        status: 'active',
      }),
    });
  } catch (e) {
    logger.error('WooCommerce webhook registration failed', e);
    throw e;
  }
}
