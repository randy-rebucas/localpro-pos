import { logger } from '@/lib/logger';

/** Normalize store base URL for Woo REST (`/wp-json/wc/v3`). */
export function normalizeWooCommerceSiteUrl(raw: string): string {
  let u = raw.trim();
  if (!u) throw new Error('Site URL is required');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error('Invalid site URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Site URL must use http or https');
  }
  const path = parsed.pathname.replace(/\/$/, '');
  return path ? `${parsed.origin}${path}` : parsed.origin;
}

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/$/, '');
}

export function wooApiUrl(siteUrl: string, path: string, consumerKey: string, consumerSecret: string): URL {
  const base = normalizeSiteUrl(siteUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}/wp-json/wc/v3${p}`);
  url.searchParams.set('consumer_key', consumerKey);
  url.searchParams.set('consumer_secret', consumerSecret);
  return url;
}

export async function wooFetchJson<T>(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = wooApiUrl(siteUrl, path, consumerKey, consumerSecret);
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'LocalPro-POS/1.0 (WooCommerce integration)',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.warn('WooCommerce API error', { status: res.status, text: text.slice(0, 500) });
    throw new Error(`WooCommerce API ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

/** DELETE helper (e.g. webhooks). WooCommerce expects `force=true` to trash webhooks. */
export async function wooDelete(
  siteUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string
): Promise<void> {
  const url = wooApiUrl(siteUrl, path, consumerKey, consumerSecret);
  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LocalPro-POS/1.0 (WooCommerce integration)',
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    logger.warn('WooCommerce DELETE error', { status: res.status, text: text.slice(0, 300) });
    throw new Error(`WooCommerce DELETE ${res.status}: ${text.slice(0, 200)}`);
  }
}
