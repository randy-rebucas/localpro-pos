/**
 * Super-admin routes that read/write tenants and users through the identity
 * repositories (lib/db): users/[id], impersonate, users list, tenants list,
 * tenants/[slug] update and stats.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const repos = vi.hoisted(() => ({
  superAdminActions: { create: vi.fn() },
  tenants: {
    findBySlug: vi.fn(),
    search: vi.fn(),
    update: vi.fn(),
    countAll: vi.fn(),
    countFlaggedActive: vi.fn(),
  },
  users: {
    findById: vi.fn(),
    findByIdWithTenant: vi.fn(),
    findFirstActiveByRole: vi.fn(),
    search: vi.fn(),
    update: vi.fn(),
    countAllExceptSuperAdmins: vi.fn(),
  },
}));

vi.mock('@/lib/db', async () => {
  const errors = await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors');
  return {
    getRepos: () => repos,
    mongoTx: (s: unknown) => ({ driver: 'mongo', session: s }),
    isDuplicateKeyError: errors.isDuplicateKeyError,
  };
});

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const mockRequireRole = vi.fn();
const mockGenerateToken = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  generateToken: (...args: unknown[]) => mockGenerateToken(...args),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

import { createAuditLog } from '@/lib/audit';
import { DuplicateKeyError } from '@/lib/db/errors';
import { PUT as PUT_USER } from '@/app/api/super-admin/users/[id]/route';
import { GET as GET_USERS } from '@/app/api/super-admin/users/route';
import { POST as IMPERSONATE } from '@/app/api/super-admin/impersonate/route';
import { GET as GET_TENANTS } from '@/app/api/super-admin/tenants/route';
import { PUT as PUT_TENANT } from '@/app/api/super-admin/tenants/[slug]/route';
import { GET as GET_STATS } from '@/app/api/super-admin/stats/route';

const ADMIN = { userId: 'admin-1', tenantId: '', email: 'root@x.com', role: 'super_admin' };

function request(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue(ADMIN);
  mockGenerateToken.mockReturnValue('signed-token');
});

describe('PUT /api/super-admin/users/[id]', () => {
  const params = { params: Promise.resolve({ id: 'u1' }) };

  it('refuses to modify a super_admin account', async () => {
    repos.users.findById.mockResolvedValue({ _id: 'u1', role: 'super_admin', isActive: true });

    const res = await PUT_USER(request('/api/super-admin/users/u1', 'PUT', { action: 'deactivate' }), params);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Cannot modify super_admin accounts');
    expect(repos.users.update).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user', async () => {
    repos.users.findById.mockResolvedValue(null);
    const res = await PUT_USER(request('/api/super-admin/users/u1', 'PUT', { action: 'activate' }), params);
    expect(res.status).toBe(404);
  });

  it('deactivates a user, audits it and returns the populated user', async () => {
    repos.users.findById.mockResolvedValue({ _id: 'u1', role: 'cashier', isActive: true, tenantId: 't1' });
    repos.users.update.mockResolvedValue({ before: {}, after: {}, changed: ['isActive'] });
    const populated = { _id: 'u1', role: 'cashier', isActive: false, tenantId: { _id: 't1', slug: 'acme', name: 'Acme' } };
    repos.users.findByIdWithTenant.mockResolvedValue(populated);

    const res = await PUT_USER(request('/api/super-admin/users/u1', 'PUT', { action: 'deactivate' }), params);

    expect(res.status).toBe(200);
    expect(repos.users.update).toHaveBeenCalledWith('u1', { isActive: false });
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: 't1', action: 'user.deactivate' }));
    expect((await res.json()).data).toEqual(populated);
  });

  it('changes role only to an allowed role', async () => {
    repos.users.findById.mockResolvedValue({ _id: 'u1', role: 'cashier', isActive: true, tenantId: 't1' });

    const bad = await PUT_USER(request('/api/super-admin/users/u1', 'PUT', { action: 'change-role', role: 'super_admin' }), params);
    expect(bad.status).toBe(400);
    expect(repos.users.update).not.toHaveBeenCalled();

    repos.users.update.mockResolvedValue({ before: {}, after: {}, changed: ['role'] });
    repos.users.findByIdWithTenant.mockResolvedValue({ _id: 'u1', role: 'manager' });
    const ok = await PUT_USER(
      request('/api/super-admin/users/u1', 'PUT', { action: 'change-role', role: 'manager' }),
      { params: Promise.resolve({ id: 'u1' }) }
    );
    expect(ok.status).toBe(200);
    expect(repos.users.update).toHaveBeenCalledWith('u1', { role: 'manager' });
  });
});

describe('POST /api/super-admin/impersonate', () => {
  it('falls back from owner to owner/admin when the tenant has no active owner', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1' });
    repos.users.findFirstActiveByRole
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'u2', email: 'admin@acme.com', role: 'admin', tenantId: 't1' });

    const res = await IMPERSONATE(request('/api/super-admin/impersonate', 'POST', { tenantSlug: 'acme' }));

    expect(res.status).toBe(200);
    expect(repos.tenants.findBySlug).toHaveBeenCalledWith('acme', { select: '_id' });
    expect(repos.users.findFirstActiveByRole).toHaveBeenNthCalledWith(1, 't1', ['owner']);
    expect(repos.users.findFirstActiveByRole).toHaveBeenNthCalledWith(2, 't1', ['owner', 'admin']);
    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', tenantId: 't1', role: 'admin', impersonatedBy: 'admin-1' }),
      { expiresIn: '1h' }
    );
    expect(repos.superAdminActions.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'impersonation.start', targetId: 'u2' }));
    expect((await res.json()).data.user).toEqual({ id: 'u2', email: 'admin@acme.com', role: 'admin', tenantId: 't1' });
    expect(res.cookies.get('impersonation-token')?.value).toBe('signed-token');
  });

  it('uses the owner without falling back when one exists', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1' });
    repos.users.findFirstActiveByRole.mockResolvedValueOnce({ _id: 'u1', email: 'o@acme.com', role: 'owner', tenantId: 't1' });

    const res = await IMPERSONATE(request('/api/super-admin/impersonate', 'POST', { tenantSlug: 'acme' }));

    expect(res.status).toBe(200);
    expect(repos.users.findFirstActiveByRole).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the tenant has neither owner nor admin', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1' });
    repos.users.findFirstActiveByRole.mockResolvedValue(null);

    const res = await IMPERSONATE(request('/api/super-admin/impersonate', 'POST', { tenantSlug: 'acme' }));
    expect(res.status).toBe(404);
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown tenant', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);
    const res = await IMPERSONATE(request('/api/super-admin/impersonate', 'POST', { tenantSlug: 'nope' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Tenant not found');
  });

  it('refuses to impersonate a super-admin by userId', async () => {
    repos.users.findById.mockResolvedValue({ _id: 'u9', email: 'r@x.com', role: 'super_admin' });
    const res = await IMPERSONATE(request('/api/super-admin/impersonate', 'POST', { userId: 'u9' }));
    expect(res.status).toBe(403);
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});

describe('GET /api/super-admin/users', () => {
  it('resolves tenantSlug and searches users in that tenant', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1' });
    repos.users.search.mockResolvedValue({ items: [{ _id: 'u1' }], total: 51 });

    const res = await GET_USERS(request('/api/super-admin/users?tenantSlug=acme&search=bob&page=2&limit=50'));
    const body = await res.json();

    expect(repos.users.search).toHaveBeenCalledWith(
      { role: undefined, search: 'bob', tenantId: 't1' },
      { skip: 50, limit: 50 }
    );
    expect(body.pagination).toEqual({ page: 2, limit: 50, total: 51, pages: 2 });
  });

  it('returns an empty page for an unknown tenantSlug', async () => {
    repos.tenants.findBySlug.mockResolvedValue(null);
    const res = await GET_USERS(request('/api/super-admin/users?tenantSlug=nope'));
    expect((await res.json()).pagination.total).toBe(0);
    expect(repos.users.search).not.toHaveBeenCalled();
  });
});

describe('GET /api/super-admin/tenants', () => {
  it('passes search/active filters and keeps the pagination shape', async () => {
    repos.tenants.search.mockResolvedValue({ items: [{ _id: 't1', slug: 'acme' }], total: 41 });

    const res = await GET_TENANTS(request('/api/super-admin/tenants?search=ac&active=false&page=3&limit=20'));
    const body = await res.json();

    expect(repos.tenants.search).toHaveBeenCalledWith(
      { search: 'ac', isActive: false },
      { skip: 40, limit: 20 },
      { select: expect.stringContaining('settings.businessType') }
    );
    expect(body).toEqual({
      success: true,
      data: [{ _id: 't1', slug: 'acme' }],
      pagination: { page: 3, limit: 20, total: 41, pages: 3 },
    });
  });
});

describe('PUT /api/super-admin/tenants/[slug]', () => {
  const params = { params: Promise.resolve({ slug: 'acme' }) };

  it('sets the top-level fields (null for a cleared domain) on the tenant id', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1', slug: 'acme', name: 'Old', settings: { currency: 'PHP' } });
    repos.tenants.update.mockResolvedValue({ _id: 't1', slug: 'acme', name: 'New' });

    const res = await PUT_TENANT(request('/api/super-admin/tenants/acme', 'PUT', { name: ' New ', domain: '  ', settings: { language: 'es' } }), params);

    expect(res.status).toBe(200);
    expect(repos.tenants.update).toHaveBeenCalledWith('t1', {
      set: { name: 'New', domain: null, settings: { currency: 'PHP', language: 'es' } },
    });
  });

  it('maps a duplicate domain to the same 400 as before', async () => {
    repos.tenants.findBySlug.mockResolvedValue({ _id: 't1', slug: 'acme', name: 'Old', settings: {} });
    const raw = Object.assign(new Error('E11000'), { code: 11000, keyPattern: { domain: 1 } });
    repos.tenants.update.mockRejectedValue(new DuplicateKeyError('Duplicate key', raw));
    const res = await PUT_TENANT(request('/api/super-admin/tenants/acme', 'PUT', { domain: 'taken.com' }), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'domain already exists', code: 'DUPLICATE_KEY' });
  });
});

describe('GET /api/super-admin/stats', () => {
  it('reports tenant and user counts', async () => {
    repos.tenants.countAll.mockResolvedValue(10);
    repos.tenants.countFlaggedActive.mockResolvedValue(7);
    repos.users.countAllExceptSuperAdmins.mockResolvedValue(42);

    const res = await GET_STATS(request('/api/super-admin/stats'));
    expect((await res.json()).data).toEqual({ totalTenants: 10, activeTenants: 7, inactiveTenants: 3, totalUsers: 42 });
  });
});
