import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

// ---------------------------------------------------------------------------
// Locale + tenant (non-API) — merged from former app/proxy.ts
// ---------------------------------------------------------------------------

const locales = ['en', 'es'];
const defaultLocale = 'en';
const defaultTenant = 'default';

function getLocale(request: NextRequest): string {
  const headers = {
    'accept-language': request.headers.get('accept-language') || 'en',
  };
  const languages = new Negotiator({ headers }).languages();
  return match(languages, locales, defaultLocale);
}

function shouldSkipLocaleRedirect(pathname: string): boolean {
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') return true;
  if (pathname.startsWith('/api/')) return true;
  const last = pathname.split('/').filter(Boolean).pop() || '';
  if (last.includes('.')) return true;
  return false;
}

function localeTenantRedirect(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  if (pathname.includes('/forbidden') || pathname.includes('/error') || pathname.includes('/not-found')) {
    return NextResponse.next();
  }

  const pathParts = pathname.split('/').filter(Boolean);

  if (pathParts.length >= 2) {
    const secondPart = pathParts[1];
    if (locales.includes(secondPart)) {
      return NextResponse.next();
    }
    if (secondPart === 'forbidden' || secondPart === 'error' || secondPart === 'not-found') {
      return NextResponse.next();
    }
  }

  let tenantSlug = defaultTenant;
  const subdomain = host.split(':')[0].split('.')[0];
  if (subdomain && subdomain !== 'www' && subdomain !== 'localhost' && subdomain !== '127.0.0.1') {
    tenantSlug = subdomain;
  }

  const locale = getLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${tenantSlug}/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

// ---------------------------------------------------------------------------
// CORS (multi-origin ALLOWED_ORIGINS — cannot be static in next.config)
// ---------------------------------------------------------------------------

function getAllowedCorsOrigins(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return ['http://localhost:3000'];
  }
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function applyApiCors(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const allowed = getAllowedCorsOrigins();
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );
  }
  return response;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per process, sliding window)
// For multi-instance deployments swap to @upstash/ratelimit + @upstash/redis.
// ---------------------------------------------------------------------------

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateBucket>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanupRateStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) rateLimitStore.delete(key);
  }
}

function checkRate(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAfterMs: number } {
  cleanupRateStore();
  const now = Date.now();
  const bucket = rateLimitStore.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAfterMs: windowMs };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAfterMs: bucket.resetAt - now };
  }
  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, resetAfterMs: bucket.resetAt - now };
}

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Rate limit tiers (first match wins)
const RATE_TIERS: { match: (p: string) => boolean; limit: number; windowMs: number }[] = [
  { match: (p) => p.startsWith('/api/auth/'), limit: 30, windowMs: 60_000 },
  { match: (p) => p.startsWith('/api/automations/'), limit: 60, windowMs: 60_000 },
  { match: () => true, limit: 100, windowMs: 60_000 },
];

function getRateLimit(pathname: string) {
  for (const tier of RATE_TIERS) {
    if (tier.match(pathname)) return { limit: tier.limit, windowMs: tier.windowMs };
  }
  return { limit: 100, windowMs: 60_000 };
}

// ---------------------------------------------------------------------------
// CSRF protection (defense-in-depth on top of SameSite cookies)
// ---------------------------------------------------------------------------

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths exempt from CSRF check (auth, cron, webhooks)
const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/super-admin/auth/',
  '/api/automations/',
  '/api/paypal/',
  '/api/tenants/signup',
];

function isCsrfExempt(pathname: string) {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function validateCsrf(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      /* malformed */
    }
  }
  if (request.headers.get('x-requested-with')) return true;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Auth constants
// ---------------------------------------------------------------------------

/**
 * Public API routes that do NOT require authentication.
 * Everything else under /api/ requires a valid JWT.
 */
const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/reset-password',
  '/api/auth/customer/send-otp',
  '/api/auth/customer/verify-otp',
  '/api/tenants/signup',
  '/api/tenants', // public store selector list (GET only); POST still enforced in route
  '/api/subscription-plans',
  '/api/business-types',
  '/api/health',
  '/api/super-admin/auth/login',
]);

/** Automation routes are protected by CRON_SECRET, not JWT */
const AUTOMATION_PREFIX = '/api/automations/';

interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';

// ---------------------------------------------------------------------------
// Proxy handler
// ---------------------------------------------------------------------------

/**
 * Next.js 16 proxy: admin host rewrite, `/api/*` (rate limit, CSRF, JWT, CORS),
 * then locale/tenant redirects for pages.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Subdomain routing: admin.* → /super-admin/... ──────────────────────
  const host = (request.headers.get('host') || '').split(':')[0];
  const hostParts = host.split('.');
  if (hostParts.length >= 2 && hostParts[0] === 'admin') {
    if (!pathname.startsWith('/super-admin') && !pathname.startsWith('/api/super-admin')) {
      const url = request.nextUrl.clone();
      url.pathname = `/super-admin${pathname === '/' ? '/dashboard' : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ── API: CORS preflight ─────────────────────────────────────────────────
  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    return applyApiCors(res, request);
  }

  // ── API: rate limit, CSRF, JWT, CORS ────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const ip = getIp(request);
    const { limit, windowMs } = getRateLimit(pathname);
    const rate = checkRate(`${ip}:${pathname}`, limit, windowMs);

    if (!rate.allowed) {
      return applyApiCors(
        NextResponse.json(
          { success: false, error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil(rate.resetAfterMs / 1000)),
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
            },
          }
        ),
        request
      );
    }

    if (STATE_CHANGING_METHODS.has(request.method) && !isCsrfExempt(pathname)) {
      if (!validateCsrf(request)) {
        return applyApiCors(
          NextResponse.json({ success: false, error: 'CSRF validation failed' }, { status: 403 }),
          request
        );
      }
    }

    if (pathname.startsWith(AUTOMATION_PREFIX)) {
      return addResponseHeaders(NextResponse.next(), limit, rate.remaining, request);
    }

    for (const pub of PUBLIC_API_PATHS) {
      if (pathname === pub || pathname.startsWith(pub + '/')) {
        return addResponseHeaders(NextResponse.next(), limit, rate.remaining, request);
      }
    }

    const token =
      request.cookies.get('auth-token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return applyApiCors(
        NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
        request
      );
    }

    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      const response = NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      response.cookies.delete('auth-token');
      return applyApiCors(response, request);
    }

    const isSuperAdmin = payload.role === 'super_admin';
    if (!payload.userId || (!isSuperAdmin && !payload.tenantId) || !payload.role) {
      return applyApiCors(
        NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
        request
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId);
    requestHeaders.set('x-tenant-id', payload.tenantId);
    requestHeaders.set('x-user-role', payload.role);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    return addResponseHeaders(response, limit, rate.remaining, request);
  }

  // ── Pages: root App Router entries (no /[tenant]/[lang] prefix) ────────
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/stores' ||
    pathname.startsWith('/super-admin')
  ) {
    return NextResponse.next();
  }

  // ── Pages: locale + tenant for remaining paths ─────────────────────────
  if (shouldSkipLocaleRedirect(pathname)) {
    return NextResponse.next();
  }

  return localeTenantRedirect(request);
}

function addResponseHeaders(
  response: NextResponse,
  limit: number,
  remaining: number,
  request: NextRequest
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-Request-Id', crypto.randomUUID());
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return applyApiCors(response, request);
}
