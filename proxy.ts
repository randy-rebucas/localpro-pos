import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

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

/**
 * Proxy runs on Node.js runtime (not Edge) in Next.js 16.
 * No export const config — matcher is not supported; filtering is done inline.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Automation routes use CRON_SECRET — skip JWT check
  if (pathname.startsWith(AUTOMATION_PREFIX)) {
    return NextResponse.next();
  }

  // Exact public paths or sub-paths
  for (const pub of PUBLIC_API_PATHS) {
    if (pathname === pub || pathname.startsWith(pub + '/')) {
      return NextResponse.next();
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

  if (!payload.userId || !payload.tenantId || !payload.role) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Attach decoded claims as headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-tenant-id', payload.tenantId);
  requestHeaders.set('x-user-role', payload.role);

  return NextResponse.next({ request: { headers: requestHeaders } });
}
