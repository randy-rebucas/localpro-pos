// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-csrf-proxy-tests-32chars!!';
process.env.NODE_ENV = 'test';

/**
 * Tests for the CSRF and exempt-path logic extracted from proxy.ts.
 *
 * We test the pure logic by re-implementing the helpers from proxy.ts inline,
 * keeping perfect fidelity with the source (copied verbatim) while avoiding
 * the need to instantiate the full Next.js middleware runtime.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Re-implement the pure helpers from proxy.ts (copied verbatim)
// These must stay in sync with proxy.ts if the source changes.
// ---------------------------------------------------------------------------

const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/',
  '/api/super-admin/auth/',
  '/api/automations/',
  '/api/paypal/',
  '/api/tenants/signup',
];

function isCsrfExempt(pathname: string): boolean {
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
// Helper: build a NextRequest with arbitrary headers
// ---------------------------------------------------------------------------
function makeRequest(
  pathname: string,
  method: string,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, { method, headers });
}

// ---------------------------------------------------------------------------
// validateCsrf — matching origin/host
// ---------------------------------------------------------------------------
describe('validateCsrf — same-origin check', () => {
  it('passes when origin.host matches host header', () => {
    const req = makeRequest('/api/products', 'POST', {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    });
    expect(validateCsrf(req)).toBe(true);
  });

  it('passes for origin without port when host also has no port', () => {
    const req = makeRequest('/api/products', 'POST', {
      origin: 'https://example.com',
      host: 'example.com',
    });
    expect(validateCsrf(req)).toBe(true);
  });

  it('fails when origin.host does not match host header', () => {
    const req = makeRequest('/api/products', 'POST', {
      origin: 'http://attacker.com',
      host: 'localhost:3000',
    });
    // No x-requested-with and no JSON content-type either → fails
    expect(validateCsrf(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateCsrf — x-requested-with header
// ---------------------------------------------------------------------------
describe('validateCsrf — x-requested-with header', () => {
  it('passes when x-requested-with header is present (any value)', () => {
    const req = makeRequest('/api/products', 'POST', {
      'x-requested-with': 'XMLHttpRequest',
    });
    expect(validateCsrf(req)).toBe(true);
  });

  it('passes with a custom value for x-requested-with', () => {
    const req = makeRequest('/api/products', 'DELETE', {
      'x-requested-with': 'fetch',
    });
    expect(validateCsrf(req)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCsrf — JSON content-type
// ---------------------------------------------------------------------------
describe('validateCsrf — JSON content-type', () => {
  it('passes POST with application/json content-type', () => {
    const req = makeRequest('/api/products', 'POST', {
      'content-type': 'application/json',
    });
    expect(validateCsrf(req)).toBe(true);
  });

  it('passes DELETE with application/json content-type', () => {
    const req = makeRequest('/api/products/123', 'DELETE', {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(validateCsrf(req)).toBe(true);
  });

  it('passes PUT with application/json content-type', () => {
    const req = makeRequest('/api/products/123', 'PUT', {
      'content-type': 'application/json',
    });
    expect(validateCsrf(req)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateCsrf — no valid headers → blocked
// ---------------------------------------------------------------------------
describe('validateCsrf — no valid CSRF headers', () => {
  it('fails POST with no special headers', () => {
    const req = makeRequest('/api/products', 'POST', {});
    expect(validateCsrf(req)).toBe(false);
  });

  it('fails POST with only form content-type (not JSON)', () => {
    const req = makeRequest('/api/products', 'POST', {
      'content-type': 'application/x-www-form-urlencoded',
    });
    expect(validateCsrf(req)).toBe(false);
  });

  it('fails DELETE with no special headers', () => {
    const req = makeRequest('/api/products/1', 'DELETE', {});
    expect(validateCsrf(req)).toBe(false);
  });

  it('fails PATCH with multipart/form-data (not JSON, no x-requested-with)', () => {
    const req = makeRequest('/api/products/1', 'PATCH', {
      'content-type': 'multipart/form-data; boundary=----boundary',
    });
    expect(validateCsrf(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCsrfExempt — auth paths
// ---------------------------------------------------------------------------
describe('isCsrfExempt — auth paths', () => {
  it('exempts /api/auth/login', () => {
    expect(isCsrfExempt('/api/auth/login')).toBe(true);
  });

  it('exempts /api/auth/logout', () => {
    expect(isCsrfExempt('/api/auth/logout')).toBe(true);
  });

  it('exempts /api/auth/register', () => {
    expect(isCsrfExempt('/api/auth/register')).toBe(true);
  });

  it('exempts /api/super-admin/auth/login', () => {
    expect(isCsrfExempt('/api/super-admin/auth/login')).toBe(true);
  });

  it('does NOT exempt /api/auth-settings (similar prefix but not a match)', () => {
    expect(isCsrfExempt('/api/auth-settings')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCsrfExempt — automation paths
// ---------------------------------------------------------------------------
describe('isCsrfExempt — automation paths', () => {
  it('exempts /api/automations/low-stock-alerts', () => {
    expect(isCsrfExempt('/api/automations/low-stock-alerts')).toBe(true);
  });

  it('exempts any path under /api/automations/', () => {
    expect(isCsrfExempt('/api/automations/send-reports')).toBe(true);
    expect(isCsrfExempt('/api/automations/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCsrfExempt — paypal paths
// ---------------------------------------------------------------------------
describe('isCsrfExempt — paypal paths', () => {
  it('exempts /api/paypal/webhook', () => {
    expect(isCsrfExempt('/api/paypal/webhook')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCsrfExempt — tenant signup
// ---------------------------------------------------------------------------
describe('isCsrfExempt — tenant signup', () => {
  it('exempts /api/tenants/signup', () => {
    expect(isCsrfExempt('/api/tenants/signup')).toBe(true);
  });

  it('does NOT exempt /api/tenants (different path)', () => {
    expect(isCsrfExempt('/api/tenants')).toBe(false);
  });

  it('does NOT exempt /api/tenants/list', () => {
    expect(isCsrfExempt('/api/tenants/list')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCsrfExempt — non-exempt paths
// ---------------------------------------------------------------------------
describe('isCsrfExempt — non-exempt paths', () => {
  it('does NOT exempt /api/products', () => {
    expect(isCsrfExempt('/api/products')).toBe(false);
  });

  it('does NOT exempt /api/transactions', () => {
    expect(isCsrfExempt('/api/transactions')).toBe(false);
  });

  it('does NOT exempt /api/users', () => {
    expect(isCsrfExempt('/api/users')).toBe(false);
  });

  it('does NOT exempt /api/super-admin/users (only /api/super-admin/auth/ is exempt)', () => {
    expect(isCsrfExempt('/api/super-admin/users')).toBe(false);
  });
});
