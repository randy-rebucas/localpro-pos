/**
 * Normalize a Host header (or stored domain/subdomain) for tenant lookup.
 *
 * Host headers are case-insensitive and may carry a port or a trailing dot
 * (fully-qualified form), so `Shop.Example.com.:443` and `shop.example.com`
 * must resolve to the same tenant. Edge-safe: no Node/DB imports, so it can
 * be used from proxy.ts as well as lib/tenant.ts and scripts.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return '';
  let h = host.trim().toLowerCase();
  if (h.startsWith('[')) {
    // IPv6 literal: "[::1]:3000" → "[::1]"
    const end = h.indexOf(']');
    h = end === -1 ? h : h.slice(0, end + 1);
  } else {
    const colon = h.indexOf(':');
    if (colon !== -1) h = h.slice(0, colon);
  }
  return h.replace(/\.+$/, '');
}
