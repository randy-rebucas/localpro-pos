import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import { encryptCredentialsPayload } from '@/lib/ecommerce/crypto';
import { getShopifyCredentials } from '@/lib/ecommerce/integration-credentials';
import type { ITenantEcommerceIntegration } from '@/models/TenantEcommerceIntegration';
import type { ShopifyCredentials } from '@/lib/ecommerce/types';
import { shopifyRefreshOfflineToken, shopifyCredentialsFromTokenResponse } from '@/lib/ecommerce/shopify-oauth';

const ACCESS_EXPIRY_BUFFER_SEC = 120;

/**
 * Returns a valid Admin API access token, refreshing the expiring offline token when needed.
 */
export async function getShopifyAccessTokenForIntegration(
  integration: Pick<ITenantEcommerceIntegration, 'credentialsEncrypted' | 'shopDomain'> & {
    _id: mongoose.Types.ObjectId | string;
  }
): Promise<string> {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET not configured');
  }
  const shop = integration.shopDomain;
  if (!shop) throw new Error('Shop domain missing');

  const cred = getShopifyCredentials(integration as { credentialsEncrypted: string });
  const ext = cred as ShopifyCredentials;

  if (!ext.refreshToken) {
    return ext.accessToken;
  }

  const expiresAt = ext.accessTokenExpiresAtMs;
  const bufferMs = ACCESS_EXPIRY_BUFFER_SEC * 1000;
  const needsRefresh = typeof expiresAt !== 'number' || Date.now() >= expiresAt - bufferMs;

  if (!needsRefresh) {
    return ext.accessToken;
  }

  const refreshed = await shopifyRefreshOfflineToken(shop, clientId, clientSecret, ext.refreshToken);
  const next = shopifyCredentialsFromTokenResponse(refreshed);
  const enc = encryptCredentialsPayload({
    accessToken: next.accessToken,
    ...(next.refreshToken != null && {
      refreshToken: next.refreshToken,
      accessTokenExpiresAtMs: next.accessTokenExpiresAtMs,
    }),
  } as Record<string, unknown>);

  await connectDB();
  await TenantEcommerceIntegration.updateOne({ _id: integration._id }, { $set: { credentialsEncrypted: enc } });

  return next.accessToken;
}
