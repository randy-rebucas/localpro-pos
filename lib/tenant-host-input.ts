/**
 * Validation for the hosts a tenant can claim (Tenant.subdomain / Tenant.domain).
 *
 * getTenantFromHost resolves a request to a tenant by the first label of the
 * host or by the full host, and host resolution wins over the referer. A tenant
 * that could claim the platform's own host (or a name like "www", "api", "app")
 * would capture every request made on it, so those are refused here.
 */

/** First labels that belong to the platform, never to a tenant. */
export const RESERVED_SUBDOMAINS = new Set<string>([
  'www', 'api', 'app', 'admin', 'super-admin', 'superadmin', 'dashboard',
  'auth', 'login', 'signup', 'register', 'account', 'accounts', 'billing',
  'pay', 'payments', 'checkout', 'store', 'stores', 'shop', 'docs', 'help',
  'support', 'status', 'mail', 'email', 'smtp', 'ftp', 'cdn', 'static',
  'assets', 'media', 'files', 'img', 'images', 'blog', 'dev', 'staging',
  'test', 'demo', 'beta', 'preview', 'localhost', 'default', 'root', 'system',
  'platform', '1pos', 'localpro', 'vercel',
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Hosts the platform itself is served from (env-configured, lower-case, no port). */
export function platformHosts(env: Record<string, string | undefined> = process.env): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  for (const raw of [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL, env.BASE_URL, env.VERCEL_URL, env.PLATFORM_DOMAINS]) {
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const value = part.trim();
      if (!value) continue;
      try {
        const host = new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
        if (host) hosts.add(host.replace(/^www\./, ''));
      } catch {
        // ignore malformed env values
      }
    }
  }
  return [...hosts];
}

export type HostInputResult =
  | { ok: true; value: string | null }
  | { ok: false; code: 'invalid' | 'reserved' | 'platform' };

/** `null`/'' clears the subdomain. Otherwise one DNS label that isn't reserved. */
export function parseSubdomain(input: unknown): HostInputResult {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, code: 'invalid' };
  const value = input.trim().toLowerCase();
  if (!value) return { ok: true, value: null };
  if (!LABEL.test(value)) return { ok: false, code: 'invalid' };
  if (RESERVED_SUBDOMAINS.has(value)) return { ok: false, code: 'reserved' };
  return { ok: true, value };
}

/**
 * `null`/'' clears the domain. Otherwise a full host name (no scheme, path or
 * port) that is not the platform's own host or a host under it.
 */
export function parseCustomDomain(input: unknown, hosts: string[] = platformHosts()): HostInputResult {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return { ok: false, code: 'invalid' };
  const value = input.trim().toLowerCase().replace(/\.$/, '');
  if (!value) return { ok: true, value: null };
  if (value.length > 253) return { ok: false, code: 'invalid' };
  const labels = value.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return { ok: false, code: 'invalid' };
  if (/^\d+$/.test(labels[labels.length - 1])) return { ok: false, code: 'invalid' }; // bare IP
  const bare = value.replace(/^www\./, '');
  for (const host of hosts) {
    if (bare === host || bare.endsWith(`.${host}`) || host.endsWith(`.${bare}`)) {
      return { ok: false, code: 'platform' };
    }
  }
  return { ok: true, value };
}
