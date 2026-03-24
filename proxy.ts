import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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
  { match: (p) => p.startsWith('/api/auth/'),        limit: 30,  windowMs: 60_000 },
  { match: (p) => p.startsWith('/api/automations/'), limit: 60,  windowMs: 60_000 },
  { match: () => true,                                limit: 100, windowMs: 60_000 },
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
  // 1. Same-origin: origin header matches host
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch { /* malformed */ }
  }
  // 2. Custom header (requires CORS preflight for cross-origin)
  if (request.headers.get('x-requested-with')) return true;
  // 3. JSON content-type (not a simple form submission)
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
  '/api/tenants',            // public store selector list (GET only)
  '/api/subscription-plans', // public plan listing
  '/api/business-types',
  '/api/health',
  '/api/super-admin/auth/login', // super-admin login is unauthenticated
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
 * Proxy runs on Node.js runtime (not Edge) in Next.js 16.
 * No export const config — matcher is not supported; filtering is done inline.
 *
 * Execution order: Rate Limiting → CSRF → Auth
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

  // Only gate /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = getIp(request);

  // ── Rate limiting ──────────────────────────────────────────────────────
  const { limit, windowMs } = getRateLimit(pathname);
  const rate = checkRate(`${ip}:${pathname}`, limit, windowMs);

  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rate.resetAfterMs / 1000)),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // ── CSRF protection (state-changing methods only) ──────────────────────
  if (STATE_CHANGING_METHODS.has(request.method) && !isCsrfExempt(pathname)) {
    if (!validateCsrf(request)) {
      return NextResponse.json(
        { success: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
  }

  // ── Authentication ─────────────────────────────────────────────────────

  // Automation routes use CRON_SECRET — skip JWT check
  if (pathname.startsWith(AUTOMATION_PREFIX)) {
    return addResponseHeaders(NextResponse.next(), limit, rate.remaining);
  }

  // Exact public paths or sub-paths
  for (const pub of PUBLIC_API_PATHS) {
    if (pathname === pub || pathname.startsWith(pub + '/')) {
      return addResponseHeaders(NextResponse.next(), limit, rate.remaining);
    }
  }

  // All other /api/* routes require a valid JWT
  const token =
    request.cookies.get('auth-token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let payload: JWTPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    const response = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
    response.cookies.delete('auth-token');
    return response;
  }

  // super_admin has tenantId: '' — allow empty string for that role only
  const isSuperAdmin = payload.role === 'super_admin';
  if (!payload.userId || (!isSuperAdmin && !payload.tenantId) || !payload.role) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Attach decoded claims as headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-tenant-id', payload.tenantId);
  requestHeaders.set('x-user-role', payload.role);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return addResponseHeaders(response, limit, rate.remaining);
}

function addResponseHeaders(response: NextResponse, limit: number, remaining: number): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-Request-Id', crypto.randomUUID());
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}
