import { decryptCredentialsPayload } from '@/lib/ecommerce/crypto';
import type { ShopifyCredentials, WooCommerceCredentials } from '@/lib/ecommerce/types';

export function getShopifyCredentials(integration: { credentialsEncrypted: string }): ShopifyCredentials {
  return decryptCredentialsPayload<ShopifyCredentials>(integration.credentialsEncrypted);
}

export function getWooCommerceCredentials(integration: { credentialsEncrypted: string }): WooCommerceCredentials {
  return decryptCredentialsPayload<WooCommerceCredentials>(integration.credentialsEncrypted);
}

export function getWooWebhookSecretPlain(integration: {
  webhookSecretEncrypted?: string | null;
}): string | null {
  if (!integration.webhookSecretEncrypted) return null;
  try {
    const o = decryptCredentialsPayload<{ secret: string }>(integration.webhookSecretEncrypted);
    return o.secret || null;
  } catch {
    return null;
  }
}
