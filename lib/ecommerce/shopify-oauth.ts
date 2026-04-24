import type { ShopifyCredentials } from '@/lib/ecommerce/types';
import { normalizeShopifyShopDomain } from '@/lib/ecommerce/shopify-shop-domain';

const ACCESS_EXPIRY_BUFFER_SEC = 120;

export interface ShopifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

function shopHost(shop: string): string {
  const n = normalizeShopifyShopDomain(shop);
  if (n) return n;
  return shop.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0] ?? shop;
}

/**
 * OAuth authorization code → access token.
 * `expiring=1` requests expiring offline tokens (required for new public apps / Admin API).
 * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens
 */
export async function shopifyExchangeCodeForToken(
  shop: string,
  clientId: string,
  clientSecret: string,
  code: string
): Promise<ShopifyTokenResponse> {
  const url = `https://${shopHost(shop)}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    expiring: '1',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Shopify token exchange failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as ShopifyTokenResponse;
  if (!data.access_token) throw new Error('Shopify token response missing access_token');
  return data;
}

/** Map token exchange / refresh JSON to stored credential fields. */
export function shopifyCredentialsFromTokenResponse(data: ShopifyTokenResponse): ShopifyCredentials {
  const expiresIn = data.expires_in ?? 3600;
  if (data.refresh_token) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAtMs:
        Date.now() + Math.max(60, expiresIn - ACCESS_EXPIRY_BUFFER_SEC) * 1000,
    };
  }
  return { accessToken: data.access_token };
}

/** Refresh expiring offline access token (rotates refresh_token). */
export async function shopifyRefreshOfflineToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<ShopifyTokenResponse> {
  const url = `https://${shopHost(shopDomain)}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Shopify token refresh failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as ShopifyTokenResponse;
  if (!data.access_token) throw new Error('Shopify refresh response missing access_token');
  return data;
}
