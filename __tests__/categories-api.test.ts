process.env.JWT_SECRET = 'test-secret-for-categories-api-tests-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireTenantAccess = vi.fn();
const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
}));

const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const repos = {
  categories: {
    list: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};
vi.mock('@/lib/db', async () => {
  const errors = await vi.importActual<typeof import('@/lib/db/errors')>('@/lib/db/errors');
  return { getRepos: () => repos, isDuplicateKeyError: errors.isDuplicateKeyError };
});

import { createAuditLog } from '@/lib/audit';
import { DuplicateKeyError } from '@/lib/db/errors';
import { GET, POST } from '@/app/api/categories/route';
import { GET as GET_ONE, PUT, DELETE } from '@/app/api/categories/[id]/route';

const TENANT = 'tenant-a';
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function request(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

const category = (fields: Record<string, unknown> = {}) => ({
  _id: 'c1',
  tenantId: TENANT,
  name: 'Drinks',
  isActive: true,
  ...fields,
});

beforeEach(() => {
  vi.clearAllMocks();
  const user = { userId: 'u1', tenantId: TENANT, role: 'owner' };
  mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT, user });
  mockRequireAuth.mockResolvedValue(user);
  mockGetTenantIdFromRequest.mockResolvedValue(TENANT);
  mockHasTenantPermission.mockResolvedValue(true);
});

describe('GET /api/categories', () => {
  it('lists the caller tenant categories', async () => {
    repos.categories.list.mockResolvedValue([category()]);
    const res = await GET(request('/api/categories'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([category()]);
    expect(repos.categories.list).toHaveBeenCalledWith(TENANT);
  });
});

describe('POST /api/categories', () => {
  it('creates in the caller tenant and audits it', async () => {
    repos.categories.create.mockResolvedValue(category());
    const res = await POST(request('/api/categories', 'POST', { name: 'Drinks' }));
    expect(res.status).toBe(201);
    expect(repos.categories.create).toHaveBeenCalledWith(TENANT, expect.objectContaining({ name: 'Drinks' }));
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tenantId: TENANT, entityId: 'c1' }));
  });

  it('rejects callers without categories.manage', async () => {
    mockHasTenantPermission.mockResolvedValue(false);
    const res = await POST(request('/api/categories', 'POST', { name: 'Drinks' }));
    expect(res.status).toBe(403);
    expect(repos.categories.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate name to 400', async () => {
    repos.categories.create.mockRejectedValue(new DuplicateKeyError());
    const res = await POST(request('/api/categories', 'POST', { name: 'Drinks' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Category with this name already exists');
  });

  it('returns validation errors without writing', async () => {
    const res = await POST(request('/api/categories', 'POST', { name: '' }));
    expect(res.status).toBe(400);
    expect(repos.categories.create).not.toHaveBeenCalled();
  });
});

describe('/api/categories/[id]', () => {
  it('GET is scoped to the tenant and 404s when missing', async () => {
    repos.categories.findById.mockResolvedValue(null);
    const res = await GET_ONE(request('/api/categories/c1'), params('c1'));
    expect(res.status).toBe(404);
    expect(repos.categories.findById).toHaveBeenCalledWith(TENANT, 'c1');
  });

  it('PUT updates only the provided fields and audits before/after', async () => {
    const before = category();
    const after = category({ name: 'Juices' });
    repos.categories.update.mockResolvedValue({ before, after, changed: ['name'] });
    const res = await PUT(request('/api/categories/c1', 'PUT', { name: 'Juices' }), params('c1'));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(after);
    expect(repos.categories.update).toHaveBeenCalledWith(TENANT, 'c1', { name: 'Juices', description: undefined, isActive: undefined });
    expect(createAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ changes: { before, after } }));
  });

  it('PUT 404s for a category of another tenant', async () => {
    repos.categories.update.mockResolvedValue(null);
    const res = await PUT(request('/api/categories/c1', 'PUT', { name: 'Juices' }), params('c1'));
    expect(res.status).toBe(404);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('DELETE soft-deletes', async () => {
    repos.categories.update.mockResolvedValue({ before: category(), after: category({ isActive: false }), changed: ['isActive'] });
    const res = await DELETE(request('/api/categories/c1', 'DELETE'), params('c1'));
    expect(res.status).toBe(200);
    expect(repos.categories.update).toHaveBeenCalledWith(TENANT, 'c1', { isActive: false });
  });
});
