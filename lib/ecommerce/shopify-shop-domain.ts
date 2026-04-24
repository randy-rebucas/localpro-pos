/**
 * Normalize user input to `subdomain.myshopify.com` (no protocol, path, or port).
 * Pasting `https://store.myshopify.com` otherwise becomes host `https` and breaks DNS.
 */
export function normalizeShopifyShopDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = (s.split('/')[0] ?? '').split('?')[0].split('#')[0];
  s = s.replace(/:\d+$/, '').trim();
  if (!s.endsWith('.myshopify.com')) return null;
  const sub = s.slice(0, -'.myshopify.com'.length);
  if (!sub || sub.includes('.') || sub.includes('/')) return null;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(sub)) return null;
  return s;
}
