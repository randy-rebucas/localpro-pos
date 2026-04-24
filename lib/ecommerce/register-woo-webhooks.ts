import { getPublicAppUrl } from '@/lib/ecommerce/public-url';
import { wooFetchJson, wooDelete } from '@/lib/ecommerce/woocommerce-api';
import type { ITenantEcommerceIntegration } from '@/models/TenantEcommerceIntegration';
import { getWooCommerceCredentials } from '@/lib/ecommerce/integration-credentials';
import { logger } from '@/lib/logger';

interface WooWebhookRow {
  id: number;
  delivery_url?: string;
  topic?: string;
}

/**
 * Remove existing POS webhooks for this integration (avoids duplicate deliveries on reconnect).
 */
async function removeExistingPosWebhooks(
  site: string,
  consumerKey: string,
  consumerSecret: string,
  integrationId: string
): Promise<void> {
  const needle = `/api/webhooks/woocommerce/${integrationId}`;
  for (let page = 1; page <= 20; page++) {
    const list = await wooFetchJson<WooWebhookRow[]>(
      site,
      consumerKey,
      consumerSecret,
      `/webhooks?per_page=100&page=${page}`
    );
    if (!list?.length) break;
    for (const w of list) {
      if (w.delivery_url?.includes(needle)) {
        try {
          await wooDelete(site, consumerKey, consumerSecret, `/webhooks/${w.id}?force=true`);
        } catch (e) {
          logger.warn('WooCommerce webhook delete failed', { webhookId: w.id, err: e });
        }
      }
    }
    if (list.length < 100) break;
  }
}

export async function registerWooCommerceWebhooks(
  integration: ITenantEcommerceIntegration,
  signingSecretPlain: string,
  options?: { publicAppBaseUrl?: string }
): Promise<void> {
  const site = integration.siteUrl;
  if (!site) return;
  const cred = getWooCommerceCredentials(integration);
  const base = (options?.publicAppBaseUrl ?? getPublicAppUrl()).replace(/\/$/, '');
  const delivery = `${base}/api/webhooks/woocommerce/${integration._id.toString()}`;
  const intId = String(integration._id);

  await removeExistingPosWebhooks(site, cred.consumerKey, cred.consumerSecret, intId);

  const topics = ['order.updated', 'order.created'] as const;
  for (const topic of topics) {
    await wooFetchJson(site, cred.consumerKey, cred.consumerSecret, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: `LocalPro POS — ${topic}`,
        topic,
        delivery_url: delivery,
        secret: signingSecretPlain,
        status: 'active',
      }),
    });
  }
}
