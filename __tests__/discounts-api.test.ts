process.env.JWT_SECRET = 'test-secret-for-discounts-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: {
    DISCOUNT_CREATE: 'DISCOUNT_CREATE',
    DISCOUNT_UPDATE: 'DISCOUNT_UPDATE',
    DISCOUNT_DELETE: 'DISCOUNT_DELETE',
  },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/discount-seeds', () => ({
  ensureLegalDiscounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const repos = {
  discounts: {
    list: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  isDuplicateKeyError: (e: { code?: number; name?: string } | null) =>
    e?.code === 11000 || e?.name === 'DuplicateKeyError',
}));

import { GET, POST } from '@/app/api/discounts/route';
import { PUT, DELETE } from '@/app/api/discounts/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockRequireTenantAccess.mockResolvedValue({
    tenantId,
    user: { userId, tenantId, email: 'test@example.com', role },
  });
}

const validPayload = {
  code: 'SAVE10',
  type: 'percentage' as const,
  value: 10,
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// GET /api/discounts
// ---------------------------------------------------------------------------

describe('GET /api/discounts', () => {
  it('scopes the query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    repos.discounts.list.mockResolvedValue([{ _id: 'd1', tenantId: TENANT_A }]);

    const res = await GET(createRequest('/api/discounts'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ _id: 'd1', tenantId: TENANT_A }]);
    expect(repos.discounts.list).toHaveBeenCalledWith(TENANT_A, { code: undefined, activeAt: undefined });
  });

  it('passes the code and activeOnly filters through', async () => {
    authAs(TENANT_A);
    repos.discounts.list.mockResolvedValue([]);

    await GET(createRequest('/api/discounts?code=save10&activeOnly=true'));

    expect(repos.discounts.list).toHaveBeenCalledWith(TENANT_A, { code: 'save10', activeAt: expect.any(Date) });
  });
});

// ---------------------------------------------------------------------------
// POST /api/discounts
// ---------------------------------------------------------------------------

describe('POST /api/discounts', () => {
  it('rejects creation when the caller lacks discounts.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.discounts.create).not.toHaveBeenCalled();
  });

  it('requires code, type, value, validFrom, validUntil', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/discounts', 'POST', { code: 'SAVE10' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.discounts.create).not.toHaveBeenCalled();
  });

  it('rejects a percentage value over 100', async () => {
    authAs(TENANT_A);
    repos.discounts.findByCode.mockResolvedValue(null);

    const res = await POST(createRequest('/api/discounts', 'POST', { ...validPayload, value: 150 }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.discounts.create).not.toHaveBeenCalled();
  });

  it('rejects when validUntil is not after validFrom', async () => {
    authAs(TENANT_A);
    repos.discounts.findByCode.mockResolvedValue(null);

    const res = await POST(createRequest('/api/discounts', 'POST', {
      ...validPayload, validFrom: '2026-06-01', validUntil: '2026-01-01',
    }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.discounts.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate code for the same tenant', async () => {
    authAs(TENANT_A);
    repos.discounts.findByCode.mockResolvedValue({ _id: 'existing', code: 'SAVE10' });

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
    expect(repos.discounts.findByCode).toHaveBeenCalledWith(TENANT_A, 'SAVE10');
    expect(repos.discounts.create).not.toHaveBeenCalled();
  });

  it('maps a duplicate-key error on create to 400', async () => {
    authAs(TENANT_A);
    repos.discounts.findByCode.mockResolvedValue(null);
    repos.discounts.create.mockRejectedValue(Object.assign(new Error('dup'), { name: 'DuplicateKeyError' }));

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });

  it('creates the discount scoped to the authenticated tenant', async () => {
    authAs(TENANT_A);
    repos.discounts.findByCode.mockResolvedValue(null);
    repos.discounts.create.mockResolvedValue({ _id: 'd1', code: 'SAVE10' });

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(repos.discounts.create).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ code: 'SAVE10', category: 'general', usageCount: 0, isActive: true })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /api/discounts/:id
// ---------------------------------------------------------------------------

describe('PUT /api/discounts/:id', () => {
  it('404s when the discount does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    repos.discounts.findById.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(repos.discounts.findById).toHaveBeenCalledWith(TENANT_B, 'd1');
    expect(repos.discounts.update).not.toHaveBeenCalled();
  });

  it('rejects changing the discount code after creation', async () => {
    authAs(TENANT_A);
    repos.discounts.findById.mockResolvedValue({ _id: 'd1', code: 'SAVE10' });

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { code: 'DIFFERENT' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.discounts.update).not.toHaveBeenCalled();
  });

  it('rejects update when the caller lacks discounts.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.discounts.findById).not.toHaveBeenCalled();
    expect(repos.discounts.update).not.toHaveBeenCalled();
  });

  it('rejects a percentage value over 100 based on the stored type', async () => {
    authAs(TENANT_A);
    repos.discounts.findById.mockResolvedValue({
      _id: 'd1', code: 'SAVE10', type: 'percentage', validFrom: '2026-01-01', validUntil: '2026-12-31',
    });

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { value: 150 }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.discounts.update).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    const discount = {
      _id: 'd1', code: 'SAVE10', name: 'Old Name', type: 'percentage', validFrom: '2026-01-01', validUntil: '2026-12-31',
    };
    repos.discounts.findById.mockResolvedValue(discount);
    repos.discounts.update.mockResolvedValue({
      before: discount,
      after: { ...discount, name: 'New Name' },
      changed: ['name'],
    });

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'New Name' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data.name).toBe('New Name');
    expect(repos.discounts.update).toHaveBeenCalledWith(TENANT_A, 'd1', { name: 'New Name' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/discounts/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/discounts/:id', () => {
  it('404s for a discount outside the caller tenant', async () => {
    authAs(TENANT_B);
    repos.discounts.findById.mockResolvedValue(null);

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(repos.discounts.findById).toHaveBeenCalledWith(TENANT_B, 'd1');
    expect(repos.discounts.delete).not.toHaveBeenCalled();
  });

  it('rejects deletion when the caller lacks discounts.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.discounts.findById).not.toHaveBeenCalled();
    expect(repos.discounts.delete).not.toHaveBeenCalled();
  });

  it('blocks deletion of a discount already used in transactions', async () => {
    authAs(TENANT_A);
    repos.discounts.findById.mockResolvedValue({ _id: 'd1', code: 'SAVE10', usageCount: 3 });

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain('SAVE10');
    expect(repos.discounts.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused discount', async () => {
    authAs(TENANT_A);
    repos.discounts.findById.mockResolvedValue({ _id: 'd1', code: 'SAVE10', usageCount: 0 });
    repos.discounts.delete.mockResolvedValue(true);

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(repos.discounts.delete).toHaveBeenCalledWith(TENANT_A, 'd1');
  });
});
