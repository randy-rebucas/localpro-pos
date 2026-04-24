import { SHOPIFY_API_VERSION } from '@/lib/ecommerce/constants';
import { logger } from '@/lib/logger';

export function shopifyAdminBase(shopDomain: string): string {
  const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`;
}

export async function shopifyAdminFetch<T>(
  shopDomain: string,
  accessToken: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string> }
): Promise<T> {
  const base = shopifyAdminBase(shopDomain);
  const q = init?.query;
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${pathNorm}`);
  if (q) {
    Object.entries(q).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.warn('Shopify API error', { status: res.status, path: url.pathname, text: text.slice(0, 500) });
    throw new Error(`Shopify API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export async function shopifyGetPrimaryLocationId(shopDomain: string, accessToken: string): Promise<string | null> {
  const data = await shopifyAdminFetch<{ locations: { id: number; name: string; active: boolean }[] }>(
    shopDomain,
    accessToken,
    '/locations.json'
  );
  const loc = data.locations?.find((l) => l.active) || data.locations?.[0];
  return loc ? String(loc.id) : null;
}

export async function shopifyRegisterWebhook(
  shopDomain: string,
  accessToken: string,
  topic: string,
  address: string
): Promise<{ id: number } | null> {
  try {
    const data = await shopifyAdminFetch<{ webhook: { id: number } }>(shopDomain, accessToken, '/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    });
    return data.webhook || null;
  } catch (e) {
    logger.error('shopifyRegisterWebhook', e);
    return null;
  }
}
