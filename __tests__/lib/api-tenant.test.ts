import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Tenant resolution from the request: host lookup and slug → id.
const mockGetTenantFromHost = vi.fn();
const mockGetTenantId = vi.fn();
const mockGetTenantBySlug = vi.fn();
vi.mock('@/lib/tenant', () => ({
  getTenantFromHost: (...args: unknown[]) => mockGetTenantFromHost(...args),
  getTenantId: (...args: unknown[]) => mockGetTenantId(...args),
  getTenantBySlug: (...args: unknown[]) => mockGetTenantBySlug(...args),
}));

const mockGetCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

vi.mock('@/lib/db', () => ({
  default: { tenant: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

import { getTenantIdForUser, getTenantIdFromRequest, TenantAccessViolationError } from '@/lib/api-tenant';

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  const u = new URL(url);
  return {
    url,
    nextUrl: u,
    headers: new Headers({ host: u.host, ...headers }),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

const SLUG_TO_ID: Record<string, string> = { 'shop-a': 'tenant-a', 'shop-b': 'tenant-b', default: 'tenant-default' };

describe('getTenantIdForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromHost.mockResolvedValue(null);
    mockGetTenantId.mockImplementation(async (slug: string) => SLUG_TO_ID[slug] ?? null);
    mockGetTenantBySlug.mockImplementation(async (slug: string) => (SLUG_TO_ID[slug] ? { slug } : null));
  });

  it("returns the user's own tenant when the request names the same tenant", async () => {
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-a');
    await expect(getTenantIdForUser(req, { userId: 'u1', tenantId: 'tenant-a' })).resolves.toBe('tenant-a');
  });

  it('throws TenantAccessViolationError when the request names a different tenant', async () => {
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-b');
    const result = getTenantIdForUser(req, { userId: 'u1', tenantId: 'tenant-a' });
    await expect(result).rejects.toBeInstanceOf(TenantAccessViolationError);
    await expect(getTenantIdForUser(req, { userId: 'u1', tenantId: 'tenant-a' })).rejects.toMatchObject({ tenantSlug: 'shop-b' });
  });

  it('also catches a mismatch named only by the Referer page', async () => {
    const req = makeRequest('http://localhost:3000/api/bookings', { referer: 'http://localhost:3000/shop-b/en/admin/bookings' });
    await expect(getTenantIdForUser(req, { userId: 'u1', tenantId: 'tenant-a' })).rejects.toBeInstanceOf(TenantAccessViolationError);
  });

  it('falls back to the requested tenant for a user without one (super_admin)', async () => {
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-b');
    await expect(getTenantIdForUser(req, { userId: 'admin', tenantId: undefined })).resolves.toBe('tenant-b');
  });

  it('does not authenticate again — it never calls getCurrentUser', async () => {
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-a');
    await getTenantIdForUser(req, { userId: 'u1', tenantId: 'tenant-a' });
    expect(mockGetCurrentUser).not.toHaveBeenCalled();
  });
});

describe('getTenantIdFromRequest (now built on getTenantIdForUser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromHost.mockResolvedValue(null);
    mockGetTenantId.mockImplementation(async (slug: string) => SLUG_TO_ID[slug] ?? null);
    mockGetTenantBySlug.mockImplementation(async (slug: string) => (SLUG_TO_ID[slug] ? { slug } : null));
  });

  it("still returns the authenticated user's tenant", async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-a', role: 'owner', email: 'a@x.test' });
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-a');
    await expect(getTenantIdFromRequest(req)).resolves.toBe('tenant-a');
  });

  it('still rejects a cross-tenant request', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-a', role: 'owner', email: 'a@x.test' });
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-b');
    await expect(getTenantIdFromRequest(req)).rejects.toBeInstanceOf(TenantAccessViolationError);
  });

  it('still uses the request tenant when nobody is logged in', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = makeRequest('http://localhost:3000/api/bookings?tenant=shop-b');
    await expect(getTenantIdFromRequest(req)).resolves.toBe('tenant-b');
  });
});
