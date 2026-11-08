/**
 * Guard for server-side requests to tenant-supplied URLs (WooCommerce store
 * URL, BIR eSales push endpoint, ...). Without it, any tenant manager can make
 * the server call internal services or cloud metadata (SSRF).
 *
 * - http/https only, no credentials in the URL
 * - https required in production
 * - every resolved address must be public (no loopback, private, link-local,
 *   CGNAT, multicast, metadata, ...)
 * - redirects are followed manually and each hop is re-checked
 *
 * Residual risk: DNS can change between the check and the connection (DNS
 * rebinding). Closing that needs a pinned-lookup dispatcher; the checks here
 * stop the direct cases.
 *
 * Local development against e.g. a WooCommerce on localhost: set
 * OUTBOUND_ALLOW_PRIVATE=true (ignored in production).
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundUrlError';
  }
}

const MAX_REDIRECTS = 5;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function allowPrivate(): boolean {
  return !isProduction() && process.env.OUTBOUND_ALLOW_PRIVATE === 'true';
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
];

/** True for any address a server-side request must not reach. */
export function isNonPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  }
  if (net.isIPv6(ip)) {
    const v6 = ip.toLowerCase();
    // IPv4-mapped / -compatible forms (::ffff:10.0.0.1, ::ffff:a00:1)
    const mapped = v6.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isNonPublicAddress(mapped[1]);
    const mappedHex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isNonPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (v6 === '::' || v6 === '::1') return true;
    const first = parseInt(v6.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (v6.startsWith('64:ff9b:')) return true; // NAT64 — can map to private v4
    if (v6.startsWith('2001:db8:')) return true; // documentation
    return false;
  }
  return true; // not an IP at all — treat as unsafe
}

/**
 * Parse and validate a tenant-supplied URL, resolving its host. Throws
 * UnsafeOutboundUrlError with a user-presentable message.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeOutboundUrlError('Invalid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeOutboundUrlError('URL must use https');
  }
  if (url.protocol === 'http:' && isProduction()) {
    throw new UnsafeOutboundUrlError('URL must use https');
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError('URL must not contain credentials');
  }
  if (allowPrivate()) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) {
    throw new UnsafeOutboundUrlError('URL must point to a public address');
  }

  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw new UnsafeOutboundUrlError('URL host could not be resolved');
    }
  }
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new UnsafeOutboundUrlError('URL must point to a public address');
  }
  return url;
}

/**
 * fetch() for tenant-supplied URLs: validates the URL and every redirect hop.
 * 307/308 replay the request; other redirects continue as GET without a body,
 * as browsers do.
 */
export async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let current = raw;
  let currentInit: RequestInit = { ...init };

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicHttpUrl(current);
    const res = await fetch(url.toString(), { ...currentInit, redirect: 'manual' });

    if (res.status < 300 || res.status >= 400 || res.status === 304) return res;
    const location = res.headers.get('location');
    if (!location) return res;

    current = new URL(location, url).toString();
    if (res.status !== 307 && res.status !== 308) {
      currentInit = { ...currentInit, method: 'GET', body: undefined };
    }
  }
  throw new UnsafeOutboundUrlError('Too many redirects');
}
