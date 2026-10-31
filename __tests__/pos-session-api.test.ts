import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const TENANT_A = '64b000000000000000000001';
const TENANT_B = '64b000000000000000000002';

const mockRequireAuth = vi.fn();
const mockGetTenantId = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
vi.mock('@/lib/tenant', () => ({ getTenantId: (...a: unknown[]) => mockGetTenantId(...a) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/models/PosSession', () => ({
  default: {
    findOne: (...a: unknown[]) => mockFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => mockFindOneAndUpdate(...a),
    create: (...a: unknown[]) => mockCreate(...a),
  },
}));

import { GET, POST } from '@/app/api/pos/session/[sessionId]/route';

const SESSION_ID = '0d8f6a2e-1c1b-4f1e-9d7a-2a1c5b3e4f60';
const params = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function sessionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'doc-1',
    sessionId: SESSION_ID,
    tenant: 'shop-a',
    tenantId: TENANT_A,
    cart: [{ productId: 'p1', name: 'Coffee', price: 100, quantity: 1 }],
    subtotal: 100,
    discount: null,
    tip: 0,
    total: 100,
    paymentMethod: null,
    paymentStatus: 'pending',
    lastUpdate: 1,
    ...overrides,
  };
}

/** findOne(...).lean() for GET; plain resolved value for POST. */
function findOneReturns(doc: unknown) {
  mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });
}

function getReq(tenant = 'shop-a') {
  return new NextRequest(`http://localhost/api/pos/session/${SESSION_ID}?tenant=${tenant}`);
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/pos/session/${SESSION_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 });
  mockRequireAuth.mockResolvedValue({ userId: 'u1', tenantId: TENANT_A, email: 'a@x.com', role: 'cashier' });
  mockGetTenantId.mockImplementation(async (slug: string) =>
    slug === 'shop-a' ? TENANT_A : slug === 'shop-b' ? TENANT_B : null
  );
});

describe('GET /api/pos/session/[sessionId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns 403 when the slug belongs to another tenant', async () => {
    const res = await GET(getReq('shop-b'), params);
    expect(res.status).toBe(403);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the session belongs to another tenant', async () => {
    findOneReturns(sessionDoc({ tenantId: TENANT_B, tenant: 'shop-b' }));
    const res = await GET(getReq(), params);
    expect(res.status).toBe(404);
  });

  it('returns the session for its own tenant', async () => {
    findOneReturns(sessionDoc());
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(100);
    expect(body.data.cart).toHaveLength(1);
  });

  it('accepts legacy sessions without tenantId when the verified slug matches', async () => {
    findOneReturns(sessionDoc({ tenantId: undefined }));
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 5000 });
    const res = await GET(getReq(), params);
    expect(res.status).toBe(429);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });
});

describe('POST /api/pos/session/[sessionId]', () => {
  it('returns 401 for unauthenticated writes', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(postReq({ tenant: 'shop-a', action: 'init', data: {} }), params);
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 when writing with another tenant slug', async () => {
    const res = await POST(postReq({ tenant: 'shop-b', action: 'init', data: {} }), params);
    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 403 for users without a tenant (e.g. bare super_admin)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'sa', tenantId: '', email: 's@x.com', role: 'super_admin' });
    const res = await POST(postReq({ tenant: 'shop-a', action: 'init', data: {} }), params);
    expect(res.status).toBe(403);
  });

  it('returns 404 and does not overwrite a session owned by another tenant', async () => {
    mockFindOne.mockResolvedValue(sessionDoc({ tenantId: TENANT_B, tenant: 'shop-b' }));
    const res = await POST(postReq({ tenant: 'shop-a', action: 'init', data: {} }), params);
    expect(res.status).toBe(404);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('creates a new session stamped with the authenticated tenantId', async () => {
    mockFindOne.mockResolvedValue(null);
    mockCreate.mockResolvedValue(sessionDoc({ cart: [], subtotal: 0, total: 0 }));
    const res = await POST(postReq({ tenant: 'shop-a', action: 'init', data: { taxRate: 12 } }), params);
    expect(res.status).toBe(200);
    const created = mockCreate.mock.calls[0][0];
    expect(String(created.tenantId)).toBe(TENANT_A);
    expect(created.tenant).toBe('shop-a');
    expect(created.sessionId).toBe(SESSION_ID);
  });

  it('updates the payment method on an owned session', async () => {
    mockFindOne.mockResolvedValue(sessionDoc());
    mockFindOneAndUpdate.mockResolvedValue(sessionDoc({ paymentMethod: 'cash' }));
    const res = await POST(
      postReq({ tenant: 'shop-a', action: 'update-payment-method', data: { paymentMethod: 'cash' } }),
      params
    );
    expect(res.status).toBe(200);
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'doc-1' });
    expect(update.$set.paymentMethod).toBe('cash');
    expect((await res.json()).data.paymentMethod).toBe('cash');
  });

  it('scopes the update-cart upsert by tenantId', async () => {
    mockFindOne.mockResolvedValue(null);
    mockFindOneAndUpdate.mockResolvedValue(sessionDoc());
    const res = await POST(
      postReq({ tenant: 'shop-a', action: 'update-cart', data: { cart: [], subtotal: 0, total: 0 } }),
      params
    );
    expect(res.status).toBe(200);
    const [filter, , opts] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter.sessionId).toBe(SESSION_ID);
    expect(String(filter.tenantId)).toBe(TENANT_A);
    expect(opts.upsert).toBe(true);
  });

  it('returns 400 for a missing tenant', async () => {
    const res = await POST(postReq({ action: 'init' }), params);
    expect(res.status).toBe(400);
  });
});
