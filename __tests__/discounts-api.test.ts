process.env.JWT_SECRET = 'test-secret-for-discounts-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

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

const mockDiscountFind = vi.fn();
const mockDiscountFindOne = vi.fn();
const mockDiscountCreate = vi.fn();

vi.mock('@/models/Discount', () => ({
  default: {
    find: (...args: unknown[]) => mockDiscountFind(...args),
    findOne: (...args: unknown[]) => mockDiscountFindOne(...args),
    create: (...args: unknown[]) => mockDiscountCreate(...args),
  },
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
    const sortMock = vi.fn().mockResolvedValue([{ _id: 'd1', tenantId: TENANT_A }]);
    mockDiscountFind.mockReturnValue({ sort: sortMock });

    const res = await GET(createRequest('/api/discounts'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockDiscountFind).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A }));
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
    expect(mockDiscountCreate).not.toHaveBeenCalled();
  });

  it('requires code, type, value, validFrom, validUntil', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/discounts', 'POST', { code: 'SAVE10' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockDiscountCreate).not.toHaveBeenCalled();
  });

  it('rejects a percentage value over 100', async () => {
    authAs(TENANT_A);
    mockDiscountFindOne.mockResolvedValue(null);

    const res = await POST(createRequest('/api/discounts', 'POST', { ...validPayload, value: 150 }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockDiscountCreate).not.toHaveBeenCalled();
  });

  it('rejects when validUntil is not after validFrom', async () => {
    authAs(TENANT_A);
    mockDiscountFindOne.mockResolvedValue(null);

    const res = await POST(createRequest('/api/discounts', 'POST', {
      ...validPayload, validFrom: '2026-06-01', validUntil: '2026-01-01',
    }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockDiscountCreate).not.toHaveBeenCalled();
  });

  it('rejects a duplicate code for the same tenant', async () => {
    authAs(TENANT_A);
    mockDiscountFindOne.mockResolvedValue({ _id: 'existing', code: 'SAVE10' });

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
    expect(mockDiscountCreate).not.toHaveBeenCalled();
  });

  it('creates the discount scoped to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockDiscountFindOne.mockResolvedValue(null);
    mockDiscountCreate.mockResolvedValue({ _id: 'd1', code: 'SAVE10' });

    const res = await POST(createRequest('/api/discounts', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockDiscountCreate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_A, code: 'SAVE10' }));
  });
});

// ---------------------------------------------------------------------------
// PUT /api/discounts/:id
// ---------------------------------------------------------------------------

describe('PUT /api/discounts/:id', () => {
  it('404s when the discount does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    mockDiscountFindOne.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockDiscountFindOne).toHaveBeenCalledWith({ _id: 'd1', tenantId: TENANT_B });
  });

  it('rejects changing the discount code after creation', async () => {
    authAs(TENANT_A);
    const save = vi.fn();
    mockDiscountFindOne.mockResolvedValue({ _id: 'd1', code: 'SAVE10', save });

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { code: 'DIFFERENT' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects update when the caller lacks discounts.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockDiscountFindOne).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    const save = vi.fn().mockResolvedValue(undefined);
    const discount = { _id: 'd1', code: 'SAVE10', name: 'Old Name', type: 'percentage', validFrom: '2026-01-01', validUntil: '2026-12-31', save };
    mockDiscountFindOne.mockResolvedValue(discount);

    const res = await PUT(createRequest('/api/discounts/d1', 'PUT', { name: 'New Name' }), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(discount.name).toBe('New Name');
    expect(save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/discounts/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/discounts/:id', () => {
  it('404s for a discount outside the caller tenant', async () => {
    authAs(TENANT_B);
    mockDiscountFindOne.mockResolvedValue(null);

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it('rejects deletion when the caller lacks discounts.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockDiscountFindOne).not.toHaveBeenCalled();
  });

  it('blocks deletion of a discount already used in transactions', async () => {
    authAs(TENANT_A);
    const deleteOne = vi.fn();
    mockDiscountFindOne.mockResolvedValue({ _id: 'd1', code: 'SAVE10', usageCount: 3, deleteOne });

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.error).toContain('SAVE10');
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('deletes an unused discount', async () => {
    authAs(TENANT_A);
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    mockDiscountFindOne.mockResolvedValue({ _id: 'd1', code: 'SAVE10', usageCount: 0, deleteOne });

    const res = await DELETE(createRequest('/api/discounts/d1', 'DELETE'), {
      params: Promise.resolve({ id: 'd1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(deleteOne).toHaveBeenCalled();
  });
});
