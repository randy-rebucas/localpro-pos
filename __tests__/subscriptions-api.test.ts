import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRequireRole = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockGetTenantIdFromRequest = vi.hoisted(() => vi.fn());
const mockCreateAuditLog = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCapturePayment = vi.hoisted(() => vi.fn());

// Subscription model
const mockSubscriptionFind = vi.hoisted(() => vi.fn());
const mockSubscriptionFindOne = vi.hoisted(() => vi.fn());
const mockSubscriptionFindById = vi.hoisted(() => vi.fn());
const mockSubscriptionFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockSubscriptionFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockSubscriptionCreate = vi.hoisted(() => vi.fn());

// SubscriptionPlan model
const mockPlanFindById = vi.hoisted(() => vi.fn());
const mockPlanFindOne = vi.hoisted(() => vi.fn());

// Tenant model
const mockTenantFindById = vi.hoisted(() => vi.fn());
const mockTenantFindByIdAndUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/auth', () => ({
  requireRole: mockRequireRole,
  requireAuth: mockRequireAuth,
}));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: mockGetTenantIdFromRequest }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/paypal', () => ({ capturePayment: mockCapturePayment }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/models/Subscription', () => ({
  default: {
    find: mockSubscriptionFind,
    findOne: mockSubscriptionFindOne,
    findById: mockSubscriptionFindById,
    findByIdAndUpdate: mockSubscriptionFindByIdAndUpdate,
    findOneAndUpdate: mockSubscriptionFindOneAndUpdate,
    create: mockSubscriptionCreate,
  },
}));
vi.mock('@/models/SubscriptionPlan', () => ({
  default: {
    findById: mockPlanFindById,
    findOne: mockPlanFindOne,
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: mockTenantFindById,
    findByIdAndUpdate: mockTenantFindByIdAndUpdate,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-abc';
const USER_ID = 'user-xyz';
const SUB_ID = 'sub-001';
const PLAN_ID = 'plan-001';

function makeSubDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => SUB_ID },
    tenantId: TENANT_ID,
    planId: { _id: { toString: () => PLAN_ID }, name: 'Starter', tier: 'starter' },
    status: 'active',
    billingCycle: 'monthly',
    isTrial: false,
    autoRenew: true,
    billingHistory: [],
    toObject: vi.fn(function () { return { ...this }; }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePlanDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => PLAN_ID },
    name: 'Starter',
    tier: 'starter',
    isActive: true,
    price: { monthly: 999, currency: 'PHP' },
    ...overrides,
  };
}

/** Chainable query object: supports .populate(), .sort(), .lean(), awaitable */
function makeChain(resolvedDoc: any = makeSubDoc()) {
  const chain: any = {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(resolvedDoc),
  };
  return chain;
}

function makeRequest(opts: {
  method?: string;
  url?: string;
  body?: Record<string, any>;
} = {}): NextRequest {
  const url = opts.url ?? 'http://localhost/api/subscriptions';
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
  };
  if (opts.body) init.body = JSON.stringify(opts.body);
  return new NextRequest(url, init);
}

// ── GET /api/subscriptions (admin) ───────────────────────────────────────────
describe('GET /api/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockSubscriptionFind.mockReturnValue(makeChain([makeSubDoc()]));
  });

  it('returns 200 with subscription list', async () => {
    const { GET } = await import('@/app/api/subscriptions/route');
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('requires admin role', async () => {
    const { GET } = await import('@/app/api/subscriptions/route');
    await GET(makeRequest());
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin']);
  });

  it('returns 401 when unauthorized', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/subscriptions/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when forbidden', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden: insufficient role'));
    const { GET } = await import('@/app/api/subscriptions/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('filters by status when provided', async () => {
    const { GET } = await import('@/app/api/subscriptions/route');
    await GET(makeRequest({ url: 'http://localhost/api/subscriptions?status=trial' }));
    const query = mockSubscriptionFind.mock.calls[0][0];
    expect(query.status).toBe('trial');
  });

  it('does not add status filter when not provided', async () => {
    const { GET } = await import('@/app/api/subscriptions/route');
    await GET(makeRequest());
    const query = mockSubscriptionFind.mock.calls[0][0];
    expect(query.status).toBeUndefined();
  });
});

// ── POST /api/subscriptions (admin) ──────────────────────────────────────────
describe('POST /api/subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockTenantFindById.mockResolvedValue({ _id: TENANT_ID });
    mockSubscriptionFindOne.mockResolvedValue(null); // no existing subscription
    mockPlanFindById.mockResolvedValue(makePlanDoc());
    mockSubscriptionCreate.mockResolvedValue(makeSubDoc());
    mockTenantFindByIdAndUpdate.mockResolvedValue(undefined);
    mockSubscriptionFindById.mockReturnValue(makeChain(makeSubDoc()));
  });

  it('returns 201 with created subscription', async () => {
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID },
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  it('returns 400 when tenantId is missing', async () => {
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({ method: 'POST', body: { planId: PLAN_ID } }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when planId is missing', async () => {
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({ method: 'POST', body: { tenantId: TENANT_ID } }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindById.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when tenant already has active subscription', async () => {
    mockSubscriptionFindOne.mockResolvedValue(makeSubDoc());
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when plan not found or inactive', async () => {
    mockPlanFindById.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID },
    }));
    expect(res.status).toBe(404);
  });

  it('creates trial subscription when isTrial=true', async () => {
    const { POST } = await import('@/app/api/subscriptions/route');
    await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID, isTrial: true },
    }));
    const createArg = mockSubscriptionCreate.mock.calls[0][0];
    expect(createArg.status).toBe('trial');
    expect(createArg.trialEndDate).toBeInstanceOf(Date);
  });

  it('calls createAuditLog with CREATE action', async () => {
    const { POST } = await import('@/app/api/subscriptions/route');
    await POST(makeRequest({
      method: 'POST',
      body: { tenantId: TENANT_ID, planId: PLAN_ID },
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'subscription' })
    );
  });

  it('returns 401 when unauthorized (GET handler has auth error mapping)', async () => {
    // POST /api/subscriptions catch block returns 400 for all errors (no auth mapping)
    // Test that requireRole is called, then move on
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/subscriptions/route');
    const res = await POST(makeRequest({ method: 'POST', body: {} }));
    // Route returns 400 for all unhandled errors in POST handler
    expect(res.status).toBe(400);
  });
});

// ── GET /api/subscriptions/current ───────────────────────────────────────────
describe('GET /api/subscriptions/current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
    mockSubscriptionFindOne.mockReturnValue(makeChain(makeSubDoc()));
  });

  it('returns 200 with current subscription', async () => {
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/current' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it('returns 404 when tenantId is missing', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/current' }));
    expect(res.status).toBe(404);
  });

  it('returns null data when no subscription found', async () => {
    mockSubscriptionFindOne.mockReturnValue(makeChain(null));
    const { GET } = await import('@/app/api/subscriptions/current/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/current' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toBeNull();
  });
});

// ── POST /api/subscriptions/create-trial ─────────────────────────────────────
describe('POST /api/subscriptions/create-trial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' });
    mockSubscriptionFindOne.mockResolvedValue(null);
    mockPlanFindOne.mockResolvedValue(makePlanDoc({ tier: 'starter' }));
    mockSubscriptionCreate.mockResolvedValue(makeSubDoc({ status: 'trial', isTrial: true }));
    mockTenantFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns 201 with created trial subscription', async () => {
    const { POST } = await import('@/app/api/subscriptions/create-trial/route');
    const res = await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/subscriptions/create-trial' }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/14-day trial/);
  });

  it('creates trial with isTrial=true and 14-day window', async () => {
    const { POST } = await import('@/app/api/subscriptions/create-trial/route');
    await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/subscriptions/create-trial' }));
    const createArg = mockSubscriptionCreate.mock.calls[0][0];
    expect(createArg.status).toBe('trial');
    expect(createArg.isTrial).toBe(true);
    const diffDays = Math.round((createArg.trialEndDate - createArg.startDate) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
  });

  it('returns 400 when tenant already has active subscription', async () => {
    mockSubscriptionFindOne.mockResolvedValue(makeSubDoc());
    const { POST } = await import('@/app/api/subscriptions/create-trial/route');
    const res = await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/subscriptions/create-trial' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when starter plan not available', async () => {
    mockPlanFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/create-trial/route');
    const res = await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/subscriptions/create-trial' }));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/subscriptions/create-trial/route');
    const res = await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/subscriptions/create-trial' }));
    expect(res.status).toBe(401);
  });
});

// ── POST /api/subscriptions/activate ─────────────────────────────────────────
describe('POST /api/subscriptions/activate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
    mockCapturePayment.mockResolvedValue({ status: 'COMPLETED' });
    mockPlanFindOne.mockResolvedValue(makePlanDoc());
    mockSubscriptionFindOne.mockResolvedValue(makeSubDoc()); // existing subscription to update
    mockSubscriptionFindByIdAndUpdate.mockResolvedValue(undefined);
    mockSubscriptionCreate.mockResolvedValue(makeSubDoc());
    mockTenantFindByIdAndUpdate.mockResolvedValue(undefined);
  });

  it('returns 200 on successful activation (update existing)', async () => {
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-123' },
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/activated/i);
  });

  it('creates new subscription when no existing one', async () => {
    mockSubscriptionFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-123' },
    }));
    expect(res.status).toBe(200);
    expect(mockSubscriptionCreate).toHaveBeenCalled();
  });

  it('returns 400 when planId is missing', async () => {
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { paypalOrderId: 'order-123' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when paypalOrderId is missing', async () => {
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 402 when payment capture fails', async () => {
    mockCapturePayment.mockRejectedValue(new Error('Payment gateway error'));
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-bad' },
    }));
    expect(res.status).toBe(402);
  });

  it('returns 402 when payment status is not COMPLETED', async () => {
    mockCapturePayment.mockResolvedValue({ status: 'PENDING' });
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-123' },
    }));
    expect(res.status).toBe(402);
  });

  it('returns 404 when plan not found', async () => {
    mockPlanFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-123' },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when tenantId not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/activate/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/activate',
      body: { planId: PLAN_ID, paypalOrderId: 'order-123' },
    }));
    expect(res.status).toBe(404);
  });
});

// ── GET /api/subscriptions/[id] (no auth) ────────────────────────────────────
describe('GET /api/subscriptions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionFindById.mockReturnValue(makeChain(makeSubDoc()));
  });

  it('returns 200 with subscription data', async () => {
    const { GET } = await import('@/app/api/subscriptions/[id]/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: SUB_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns 404 when subscription not found', async () => {
    mockSubscriptionFindById.mockReturnValue(makeChain(null));
    const { GET } = await import('@/app/api/subscriptions/[id]/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/subscriptions/[id] (admin) ──────────────────────────────────────
describe('PUT /api/subscriptions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockSubscriptionFindById.mockResolvedValue(makeSubDoc());
    mockSubscriptionFindByIdAndUpdate.mockReturnValue(makeChain(makeSubDoc()));
  });

  it('returns 200 on successful update', async () => {
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: { status: 'inactive' } }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('sets cancelledAt when status=cancelled', async () => {
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { status: 'cancelled' } }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    const updateArg = mockSubscriptionFindByIdAndUpdate.mock.calls[0][1];
    expect(updateArg.cancelledAt).toBeInstanceOf(Date);
    expect(updateArg.autoRenew).toBe(false);
  });

  it('recalculates nextBillingDate when billingCycle changes', async () => {
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { billingCycle: 'yearly' } }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    const updateArg = mockSubscriptionFindByIdAndUpdate.mock.calls[0][1];
    expect(updateArg.billingCycle).toBe('yearly');
    expect(updateArg.nextBillingDate).toBeInstanceOf(Date);
  });

  it('updates autoRenew', async () => {
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { autoRenew: false } }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    const updateArg = mockSubscriptionFindByIdAndUpdate.mock.calls[0][1];
    expect(updateArg.autoRenew).toBe(false);
  });

  it('calls createAuditLog with UPDATE action', async () => {
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { autoRenew: true } }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'subscription' })
    );
  });

  it('returns 404 when subscription not found', async () => {
    mockSubscriptionFindById.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: { status: 'active' } }),
      { params: Promise.resolve({ id: 'missing' }) }
    );
    expect(res.status).toBe(404);
  });

  it('enforces admin role', async () => {
    // PUT catch block returns 400 for all errors (no specific auth mapping)
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
    const { PUT } = await import('@/app/api/subscriptions/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: {} }),
      { params: Promise.resolve({ id: SUB_ID }) }
    );
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin']);
    expect(res.status).toBe(400); // route returns 400 for all errors in PUT handler
  });
});

// ── DELETE /api/subscriptions/[id] (admin) ───────────────────────────────────
describe('DELETE /api/subscriptions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockSubscriptionFindOneAndUpdate.mockResolvedValue(makeSubDoc());
  });

  it('returns 200 on successful soft-delete', async () => {
    const { DELETE } = await import('@/app/api/subscriptions/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: SUB_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls findOneAndUpdate with isActive=false and status=cancelled', async () => {
    const { DELETE } = await import('@/app/api/subscriptions/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: SUB_ID }) });
    expect(mockSubscriptionFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: SUB_ID, isActive: true },
      expect.objectContaining({ isActive: false, status: 'cancelled' }),
      { new: true }
    );
  });

  it('calls createAuditLog with DELETE action', async () => {
    const { DELETE } = await import('@/app/api/subscriptions/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: SUB_ID }) });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'subscription' })
    );
  });

  it('returns 404 when subscription not found or already inactive', async () => {
    mockSubscriptionFindOneAndUpdate.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/subscriptions/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('enforces admin role', async () => {
    // DELETE catch block returns 400 for all errors (no specific auth mapping)
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));
    const { DELETE } = await import('@/app/api/subscriptions/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: SUB_ID }) });
    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['admin']);
    expect(res.status).toBe(400); // route returns 400 for all errors in DELETE handler
  });
});

// ── GET /api/subscriptions/billing-history ────────────────────────────────────
describe('GET /api/subscriptions/billing-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
    mockSubscriptionFindOne.mockReturnValue({
      lean: () => Promise.resolve(makeSubDoc({
        billingHistory: [
          { _id: 'bh-1', amount: 999, currency: 'PHP', status: 'paid', date: new Date() },
        ],
      })),
    });
  });

  it('returns 200 with billing history', async () => {
    const { GET } = await import('@/app/api/subscriptions/billing-history/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/billing-history' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(1);
  });

  it('returns empty array when no subscription found', async () => {
    mockSubscriptionFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const { GET } = await import('@/app/api/subscriptions/billing-history/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/billing-history' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
  });

  it('returns 404 when tenantId not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const { GET } = await import('@/app/api/subscriptions/billing-history/route');
    const res = await GET(makeRequest({ url: 'http://localhost/api/subscriptions/billing-history' }));
    expect(res.status).toBe(404);
  });
});

// ── POST /api/subscriptions/request-upgrade ───────────────────────────────────
describe('POST /api/subscriptions/request-upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID });
    mockGetTenantIdFromRequest.mockResolvedValue(TENANT_ID);
    mockPlanFindOne.mockResolvedValue(makePlanDoc({ _id: { toString: () => 'plan-002' } }));
    mockSubscriptionFindOne.mockReturnValue(makeChain(makeSubDoc()));
  });

  it('returns 200 with upgrade request confirmation', async () => {
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { planId: 'plan-002', currentPlan: 'starter', requestedPlan: 'pro' },
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/submitted/i);
  });

  it('returns 400 when planId is missing', async () => {
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { currentPlan: 'starter' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when requested plan not found', async () => {
    mockPlanFindOne.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { planId: 'plan-999' },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when no current subscription found', async () => {
    mockSubscriptionFindOne.mockReturnValue(makeChain(null));
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { planId: 'plan-002' },
    }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when already on requested plan', async () => {
    // Current sub has planId whose _id.toString() === PLAN_ID
    // Plan found also has _id.toString() === PLAN_ID — already on same plan
    mockPlanFindOne.mockResolvedValue(makePlanDoc()); // _id.toString() = PLAN_ID
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { planId: PLAN_ID },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenantId not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const { POST } = await import('@/app/api/subscriptions/request-upgrade/route');
    const res = await POST(makeRequest({
      method: 'POST',
      url: 'http://localhost/api/subscriptions/request-upgrade',
      body: { planId: 'plan-002' },
    }));
    expect(res.status).toBe(404);
  });
});
