process.env.JWT_SECRET = 'test-secret-for-identity-routes-tests-32chars!';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LOGIN: 'login' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
  requireTenantAccess: vi.fn(),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    generateToken: vi.fn().mockReturnValue('signed-token'),
    getRoleRank: actual.getRoleRank,
    requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
    getCurrentUser: vi.fn(),
  };
});

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockRevokeAllUserTokens = vi.fn();
vi.mock('@/lib/token-blacklist', () => ({
  revokeAllUserTokens: (...args: unknown[]) => mockRevokeAllUserTokens(...args),
}));

const repos = vi.hoisted(() => ({
  tenants: { findBySlug: vi.fn() },
  users: {
    findByEmailForLogin: vi.fn(),
    verifyPassword: vi.fn(),
    touchLastLogin: vi.fn(),
    findInTenant: vi.fn(),
    countOtherActiveAdmins: vi.fn(),
    update: vi.fn(),
  },
  addresses: {
    findOwned: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    clearDefault: vi.fn(),
    findFirstActive: vi.fn(),
  },
}));
vi.mock('@/lib/db', async () => ({
  getRepos: () => repos,
  isDuplicateKeyError: (await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors')).isDuplicateKeyError,
}));

import { POST as LOGIN } from '@/app/api/auth/login/route';
import { PUT as PUT_USER } from '@/app/api/users/[id]/route';
import { PUT as PUT_ADDRESS, DELETE as DELETE_ADDRESS } from '@/app/api/client/address/[addressId]/route';

const TENANT = '507f1f77bcf86cd799439011';

function request(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantIdFromRequest.mockResolvedValue(TENANT);
  mockHasTenantPermission.mockResolvedValue(true);
  mockRevokeAllUserTokens.mockResolvedValue(undefined);
});

describe('POST /api/auth/login', () => {
  const loginUser = {
    _id: 'u1',
    email: 'ann@example.com',
    name: 'Ann',
    role: 'cashier',
    tenantId: TENANT,
    isActive: true,
    password: '$2a$12$hash',
  };

  beforeEach(() => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: TENANT, slug: 'shop', name: 'Shop' });
    repos.users.findByEmailForLogin.mockResolvedValue(loginUser);
  });

  it('rejects a wrong password via verifyPassword', async () => {
    repos.users.verifyPassword.mockResolvedValue(false);

    const res = await LOGIN(request('/api/auth/login', 'POST', { email: 'Ann@Example.com', password: 'wrong', tenantSlug: 'shop' }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid credentials');
    expect(repos.tenants.findBySlug).toHaveBeenCalledWith('shop', { activeOnly: true });
    expect(repos.users.findByEmailForLogin).toHaveBeenCalledWith('Ann@Example.com', { tenantId: TENANT });
    expect(repos.users.verifyPassword).toHaveBeenCalledWith(loginUser, 'wrong');
    expect(repos.users.touchLastLogin).not.toHaveBeenCalled();
    expect(res.cookies.get('auth-token')).toBeUndefined();
  });

  it('logs in with the right password and touches lastLogin', async () => {
    repos.users.verifyPassword.mockResolvedValue(true);
    repos.users.touchLastLogin.mockResolvedValue(undefined);

    const res = await LOGIN(request('/api/auth/login', 'POST', { email: 'ann@example.com', password: 'right', tenantSlug: 'shop' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user).toEqual({ _id: 'u1', email: 'ann@example.com', name: 'Ann', role: 'cashier' });
    expect(repos.users.touchLastLogin).toHaveBeenCalledWith('u1');
    expect(res.cookies.get('auth-token')?.value).toBe('signed-token');
  });

  it('returns 404 for an unknown or inactive tenant', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);

    const res = await LOGIN(request('/api/auth/login', 'POST', { email: 'ann@example.com', password: 'x', tenantSlug: 'nope' }));

    expect(res.status).toBe(404);
    expect(repos.users.findByEmailForLogin).not.toHaveBeenCalled();
  });
});

describe('PUT /api/users/[id]', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const target = { _id: 'u2', email: 'bob@example.com', name: 'Bob', role: 'cashier', tenantId: TENANT, isActive: true };

  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT, role: 'owner' });
    repos.users.findInTenant.mockResolvedValue(target);
  });

  it('passes the plain password to users.update scoped to the tenant (no hashing in the route)', async () => {
    const after = { ...target, name: 'Bobby' };
    repos.users.update.mockResolvedValue({ before: target, after, changed: ['name', 'password'] });

    const res = await PUT_USER(
      request('/api/users/u2', 'PUT', { name: 'Bobby', password: 'NewPassw0rd!' }),
      params('u2')
    );

    expect(res.status).toBe(200);
    expect(repos.users.findInTenant).toHaveBeenCalledWith(TENANT, 'u2');
    expect(repos.users.update).toHaveBeenCalledWith('u2', { name: 'Bobby', password: 'NewPassw0rd!' }, { tenantId: TENANT });
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith('u2');
    const json = await res.json();
    expect(json.data).toEqual(after);
    expect(json.data.password).toBeUndefined();
  });

  it('returns 404 when the user is not in the tenant', async () => {
    repos.users.findInTenant.mockResolvedValue(null);

    const res = await PUT_USER(request('/api/users/u2', 'PUT', { name: 'X' }), params('u2'));

    expect(res.status).toBe(404);
    expect(repos.users.update).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the last active owner/admin', async () => {
    repos.users.findInTenant.mockResolvedValue({ ...target, role: 'admin' });
    repos.users.countOtherActiveAdmins.mockResolvedValue(0);

    const res = await PUT_USER(request('/api/users/u2', 'PUT', { isActive: false }), params('u2'));

    expect(res.status).toBe(400);
    expect(repos.users.countOtherActiveAdmins).toHaveBeenCalledWith(TENANT, 'u2');
    expect(repos.users.update).not.toHaveBeenCalled();
  });

  it('refuses to modify a higher-ranked user', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT, role: 'manager' });
    repos.users.findInTenant.mockResolvedValue({ ...target, role: 'owner' });

    const res = await PUT_USER(request('/api/users/u2', 'PUT', { name: 'X' }), params('u2'));

    expect(res.status).toBe(403);
    expect(repos.users.update).not.toHaveBeenCalled();
  });
});

describe('client address routes', () => {
  const params = (addressId: string) => ({ params: Promise.resolve({ addressId }) });

  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT, role: 'viewer' });
  });

  it('does not update an address owned by another user', async () => {
    // findOwned is scoped by owner, so another user's address comes back null
    repos.addresses.findOwned.mockResolvedValue(null);

    const res = await PUT_ADDRESS(request('/api/client/address/a9', 'PUT', { street: 'Hijack St' }), params('a9'));

    expect(res.status).toBe(404);
    expect(repos.addresses.findOwned).toHaveBeenCalledWith('u1', 'a9');
    expect(repos.addresses.update).not.toHaveBeenCalled();
    expect(repos.addresses.clearDefault).not.toHaveBeenCalled();
  });

  it('updates an owned address through the owner-scoped repository', async () => {
    const address = { _id: 'a1', userId: 'u1', tenantId: TENANT, street: 'Old', city: 'C', country: 'PH', isDefault: false, isActive: true };
    repos.addresses.findOwned.mockResolvedValue(address);
    repos.addresses.update.mockResolvedValue({ ...address, street: 'New', isDefault: true });

    const res = await PUT_ADDRESS(request('/api/client/address/a1', 'PUT', { street: 'New', isDefault: true }), params('a1'));

    expect(res.status).toBe(200);
    expect(repos.addresses.clearDefault).toHaveBeenCalledWith(TENANT, 'u1', 'a1');
    expect(repos.addresses.update).toHaveBeenCalledWith('u1', 'a1', { street: 'New', isDefault: true });
  });

  it('does not delete an address owned by another user', async () => {
    repos.addresses.findOwned.mockResolvedValue(null);

    const res = await DELETE_ADDRESS(request('/api/client/address/a9', 'DELETE'), params('a9'));

    expect(res.status).toBe(404);
    expect(repos.addresses.findOwned).toHaveBeenCalledWith('u1', 'a9', { activeOnly: true });
    expect(repos.addresses.softDelete).not.toHaveBeenCalled();
  });

  it('promotes the most recent remaining address after deleting the default', async () => {
    const address = { _id: 'a1', userId: 'u1', tenantId: TENANT, isDefault: true, isActive: true };
    repos.addresses.findOwned.mockResolvedValue(address);
    repos.addresses.softDelete.mockResolvedValue({ ...address, isActive: false });
    repos.addresses.findFirstActive.mockResolvedValue({ _id: 'a2', userId: 'u1', tenantId: TENANT, isDefault: false, isActive: true });
    repos.addresses.update.mockResolvedValue({ _id: 'a2', isDefault: true });

    const res = await DELETE_ADDRESS(request('/api/client/address/a1', 'DELETE'), params('a1'));

    expect(res.status).toBe(200);
    expect(repos.addresses.softDelete).toHaveBeenCalledWith('u1', 'a1');
    expect(repos.addresses.findFirstActive).toHaveBeenCalledWith(TENANT, 'u1');
    expect(repos.addresses.update).toHaveBeenCalledWith('u1', 'a2', { isDefault: true });
  });
});
