import { logger } from '@/lib/logger';

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
      'Content-Type': 'application/json',
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
