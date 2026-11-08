process.env.JWT_SECRET = 'test-secret-for-admin-account-security-tests-32chars!!';
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { canManageUserAccount } from '@/lib/permissions';
import { parseCustomDomain, parseSubdomain, platformHosts } from '@/lib/tenant-host-input';

// ---------------------------------------------------------------------------
// Mocks (routes only — the pure helpers above are imported for real)
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 1, resetAfterMs: 0 }) }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined), AuditActions: { UPDATE: 'update', DELETE: 'delete', VIEW: 'view' } }));
vi.mock('@/lib/permissions-server', () => ({ hasTenantPermission: vi.fn().mockResolvedValue(true) }));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', async () => {
  const { ROLE_HIERARCHY } = await import('@/lib/permissions');
  return {
    requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
    getCurrentUser: (...a: unknown[]) => mockRequireAuth(...a),
    getRoleRank: (role: string) => ROLE_HIERARCHY[role] || 0,
  };
});

vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1') }));

const mockRevoke = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/token-blacklist', () => ({ revokeAllUserTokens: (...a: unknown[]) => mockRevoke(...a) }));

const mockUserFindOne = vi.fn();
const mockUserCount = vi.fn();
const mockUserFindOneAndUpdate = vi.fn();
vi.mock('@/models/User', () => ({
  default: {
    findOne: (...a: unknown[]) => mockUserFindOne(...a),
    countDocuments: (...a: unknown[]) => mockUserCount(...a),
    findOneAndUpdate: (...a: unknown[]) => mockUserFindOneAndUpdate(...a),
  },
}));

const mockTenantFindOne = vi.fn();
const mockTenantFindOneAndUpdate = vi.fn();
vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: (...a: unknown[]) => mockTenantFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockTenantFindOneAndUpdate(...a),
  },
}));
vi.mock('@/lib/business-types', () => ({
  isBusinessTypeOpenForSignup: () => true,
  applyBusinessTypeDefaults: (settings: unknown) => settings,
}));

import { PUT as putUser } from '@/app/api/users/[id]/route';
import { GET as getQr } from '@/app/api/users/[id]/qr-code/route';
import { GET as getTenant, PUT as putTenant, DELETE as deleteTenant } from '@/app/api/tenants/[slug]/route';

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('canManageUserAccount', () => {
  it('allows only lower ranks, except owners over co-owners', () => {
    expect(canManageUserAccount('manager', 'cashier')).toBe(true);
    expect(canManageUserAccount('manager', 'manager')).toBe(false);
    expect(canManageUserAccount('manager', 'owner')).toBe(false);
    expect(canManageUserAccount('admin', 'admin')).toBe(false);
    expect(canManageUserAccount('admin', 'manager')).toBe(true);
    expect(canManageUserAccount('owner', 'owner')).toBe(true);
    expect(canManageUserAccount('super_admin', 'owner')).toBe(true);
  });

  it('always allows your own account', () => {
    expect(canManageUserAccount('manager', 'manager', true)).toBe(true);
  });
});

describe('parseSubdomain', () => {
  it('accepts a DNS label and lower-cases it', () => {
    expect(parseSubdomain(' Joes-Cafe ')).toEqual({ ok: true, value: 'joes-cafe' });
  });
  it('clears on empty or null', () => {
    expect(parseSubdomain('')).toEqual({ ok: true, value: null });
    expect(parseSubdomain(null)).toEqual({ ok: true, value: null });
  });
  it('refuses reserved names and malformed input', () => {
    expect(parseSubdomain('www')).toEqual({ ok: false, code: 'reserved' });
    expect(parseSubdomain('api')).toEqual({ ok: false, code: 'reserved' });
    expect(parseSubdomain('a.b')).toEqual({ ok: false, code: 'invalid' });
    expect(parseSubdomain('-x')).toEqual({ ok: false, code: 'invalid' });
    expect(parseSubdomain(42)).toEqual({ ok: false, code: 'invalid' });
  });
});

describe('parseCustomDomain', () => {
  const hosts = platformHosts({ NEXT_PUBLIC_APP_URL: 'https://app.1pos.ph', NEXT_PUBLIC_SITE_URL: 'https://www.1pos.ph' });

  it('accepts a normal host', () => {
    expect(parseCustomDomain('Shop.Example.com', hosts)).toEqual({ ok: true, value: 'shop.example.com' });
  });
  it('refuses the platform host, hosts under it and its parent', () => {
    expect(parseCustomDomain('app.1pos.ph', hosts)).toEqual({ ok: false, code: 'platform' });
    expect(parseCustomDomain('1pos.ph', hosts)).toEqual({ ok: false, code: 'platform' });
    expect(parseCustomDomain('evil.1pos.ph', hosts)).toEqual({ ok: false, code: 'platform' });
    expect(parseCustomDomain('localhost', hosts)).toEqual({ ok: false, code: 'invalid' });
  });
  it('refuses urls, ports and bare IPs', () => {
    expect(parseCustomDomain('https://x.com', hosts).ok).toBe(false);
    expect(parseCustomDomain('x.com:3000', hosts).ok).toBe(false);
    expect(parseCustomDomain('10.0.0.1', hosts).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/users/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  let savedDoc: { set: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; toObject: () => Record<string, unknown> };

  const target = (role: string, extra: Record<string, unknown> = {}) => {
    const oldUser = { _id: 'u2', role, email: 'x@y.co', name: 'X', isActive: true, ...extra };
    savedDoc = {
      set: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ ...oldUser, password: 'hash', qrToken: 'secret' }),
    };
    mockUserFindOne
      .mockReturnValueOnce({ lean: () => Promise.resolve(oldUser) })
      .mockReturnValueOnce(Promise.resolve(savedDoc));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindOne.mockReset();
    mockUserCount.mockResolvedValue(1);
  });

  it('saves a password reset through save() so it is hashed, and signs the user out', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    target('cashier');
    const res = await putUser(json('http://x/api/users/u2', 'PUT', { password: 'NewPass#2026' }), params('u2'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(mockUserFindOneAndUpdate).not.toHaveBeenCalled();
    expect(savedDoc.set).toHaveBeenCalledWith({ password: 'NewPass#2026' });
    expect(savedDoc.save).toHaveBeenCalled();
    expect(mockRevoke).toHaveBeenCalledWith('u2');
    expect(body.data.password).toBeUndefined();
    expect(body.data.qrToken).toBeUndefined();
  });

  it('refuses an admin editing another admin', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    target('admin');
    const res = await putUser(json('http://x/api/users/u2', 'PUT', { email: 'me@evil.co', password: 'NewPass#2026' }), params('u2'));
    expect(res.status).toBe(403);
  });

  it('refuses changing your own role', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u2', role: 'owner', tenantId: 'tenant-1' });
    target('owner');
    const res = await putUser(json('http://x/api/users/u2', 'PUT', { role: 'cashier' }), params('u2'));
    expect(res.status).toBe(400);
  });

  it('refuses demoting the last owner/admin', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'owner', tenantId: 'tenant-1' });
    target('admin');
    mockUserCount.mockResolvedValue(0);
    const res = await putUser(json('http://x/api/users/u2', 'PUT', { role: 'cashier' }), params('u2'));
    expect(res.status).toBe(400);
  });

  it('signs a user out when their role changes', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'owner', tenantId: 'tenant-1' });
    target('admin');
    const res = await putUser(json('http://x/api/users/u2', 'PUT', { role: 'manager' }), params('u2'));
    expect(res.status).toBe(200);
    expect(mockRevoke).toHaveBeenCalledWith('u2');
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/[id]/qr-code
// ---------------------------------------------------------------------------

describe('GET /api/users/[id]/qr-code', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindOne.mockReset();
  });

  it("refuses a manager opening the owner's sign-in badge", async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: 'tenant-1' });
    mockUserFindOne.mockReturnValueOnce({ select: () => Promise.resolve({ role: 'owner', qrToken: 'secret', name: 'O', email: 'o@x.co' }) });
    const res = await getQr(new NextRequest('http://x/api/users/u9/qr-code'), { params: Promise.resolve({ id: 'u9' }) });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });

  it('lets a manager open a cashier badge', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'manager', tenantId: 'tenant-1' });
    mockUserFindOne.mockReturnValueOnce({ select: () => Promise.resolve({ role: 'cashier', qrToken: 'tok', name: 'C', email: 'c@x.co' }) });
    const res = await getQr(new NextRequest('http://x/api/users/u3/qr-code'), { params: Promise.resolve({ id: 'u3' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).data.qrToken).toBe('tok');
  });
});

// ---------------------------------------------------------------------------
// /api/tenants/[slug]
// ---------------------------------------------------------------------------

describe('/api/tenants/[slug]', () => {
  const params = { params: Promise.resolve({ slug: 'shop' }) };
  const tenantDoc = () => ({
    _id: { toString: () => 'tenant-1' },
    slug: 'shop',
    name: 'Shop',
    notes: 'internal super-admin note',
    settings: { currency: 'PHP', birEsalesPushUrl: 'https://secret', multiCurrency: { exchangeRateApiKey: 'k', enabled: true } },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantFindOne.mockImplementation(() => {
      const doc = tenantDoc();
      return { select: () => ({ lean: () => Promise.resolve(doc) }), lean: () => Promise.resolve(doc) };
    });
    mockTenantFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(tenantDoc()) });
  });

  it('GET strips secrets and notes for the tenant admin', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    const res = await getTenant(new NextRequest('http://x/api/tenants/shop'), params);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('exchangeRateApiKey');
    expect(text).not.toContain('https://secret');
    expect(text).not.toContain('internal super-admin note');
  });

  it('GET gives a cashier only the identity fields', async () => {
    const { hasTenantPermission } = await import('@/lib/permissions-server');
    vi.mocked(hasTenantPermission).mockResolvedValueOnce(false);
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'cashier', tenantId: 'tenant-1' });
    const res = await getTenant(new NextRequest('http://x/api/tenants/shop'), params);
    expect(Object.keys((await res.json()).data).sort()).toEqual(['_id', 'name', 'slug']);
  });

  it('PUT refuses settings keys outside the profile form', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    const res = await putTenant(
      json('http://x/api/tenants/shop', 'PUT', { settings: { rolePermissionOverrides: { manager: { 'users.manage': true } } } }),
      params
    );
    expect(res.status).toBe(400);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('PUT refuses a reserved subdomain', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    const res = await putTenant(json('http://x/api/tenants/shop', 'PUT', { subdomain: 'www' }), params);
    expect(res.status).toBe(400);
  });

  it('PUT refuses store status changes from tenant staff', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'owner', tenantId: 'tenant-1' });
    const res = await putTenant(json('http://x/api/tenants/shop', 'PUT', { isActive: false }), params);
    expect(res.status).toBe(403);
  });

  it('PUT unsets a cleared domain and saves profile fields', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 'tenant-1' });
    const res = await putTenant(
      json('http://x/api/tenants/shop', 'PUT', { name: 'Shop', domain: '', settings: { currency: 'usd', email: '', phone: '' } }),
      params
    );
    expect(res.status).toBe(200);
    const [, update] = mockTenantFindOneAndUpdate.mock.calls[0];
    expect(update.$unset).toEqual({ domain: '' });
    expect(update.$set).toMatchObject({ name: 'Shop', 'settings.currency': 'USD', 'settings.email': '', 'settings.phone': '' });
  });

  it('DELETE is platform-only', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', role: 'owner', tenantId: 'tenant-1' });
    const res = await deleteTenant(new NextRequest('http://x/api/tenants/shop', { method: 'DELETE' }), params);
    expect(res.status).toBe(403);
    expect(mockTenantFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
