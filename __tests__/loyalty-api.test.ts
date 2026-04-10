process.env.JWT_SECRET = 'test-secret-32chars-loyalty!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockConfigFindOne,
  mockConfigFindOneAndUpdate,
  mockCustomerFindOne,
  mockLoyaltyTxFind,
  mockLoyaltyTxCreate,
  mockLoyaltyTxCount,
  mockStartSession,
  mockCheckRateLimit,
} = vi.hoisted(() => {
  const commitTransaction = vi.fn().mockResolvedValue(undefined);
  const abortTransaction = vi.fn().mockResolvedValue(undefined);
  const endSession = vi.fn().mockResolvedValue(undefined);
  const startTransaction = vi.fn();
  const mockSession = { startTransaction, commitTransaction, abortTransaction, endSession };
  const mockStartSession = vi.fn().mockResolvedValue(mockSession);

  return {
    mockConfigFindOne: vi.fn(),
    mockConfigFindOneAndUpdate: vi.fn(),
    mockCustomerFindOne: vi.fn(),
    mockLoyaltyTxFind: vi.fn(),
    mockLoyaltyTxCreate: vi.fn(),
    mockLoyaltyTxCount: vi.fn(),
    mockStartSession,
    mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 }),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/LoyaltyConfig', () => ({
  default: {
    findOne: mockConfigFindOne,
    findOneAndUpdate: mockConfigFindOneAndUpdate,
  },
}));
vi.mock('@/models/Customer', () => ({
  default: { findOne: mockCustomerFindOne },
}));
vi.mock('@/models/LoyaltyTransaction', () => ({
  default: {
    find: mockLoyaltyTxFind,
    create: mockLoyaltyTxCreate,
    countDocuments: mockLoyaltyTxCount,
  },
}));
vi.mock('mongoose', () => ({
  default: { startSession: mockStartSession },
  startSession: mockStartSession,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockConfig = {
  _id: 'cfg-1',
  tenantId: 'tenant-1',
  pointsPerPeso: 1,
  pesoPerPoint: 0.1,
  minRedemption: 100,
  isEnabled: true,
};

const mockCustomer = {
  _id: 'cust-1',
  firstName: 'Jane',
  lastName: 'Smith',
  tenantId: 'tenant-1',
  loyaltyPointsBalance: 500,
  save: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// GET /api/loyalty/config
// ---------------------------------------------------------------------------

describe('GET /api/loyalty/config', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    mockConfigFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockConfig) });
    ({ GET } = await import('@/app/api/loyalty/config/route'));
  });

  it('returns 200 with loyalty config', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/config'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pointsPerPeso).toBe(1);
  });

  it('returns defaults when config not found', async () => {
    mockConfigFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/config'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pointsPerPeso).toBe(1);
    expect(body.data.isEnabled).toBe(true);
  });

  it('returns 401 when no auth token', async () => {
    const req = new NextRequest('http://localhost/api/loyalty/config', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/config'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when loyalty feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Loyalty program not available on your plan')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/config'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/loyalty/config
// ---------------------------------------------------------------------------

describe('PUT /api/loyalty/config', () => {
  let PUT: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    mockConfigFindOneAndUpdate.mockResolvedValue({ ...mockConfig, _id: 'cfg-1', pointsPerPeso: 2 });
    ({ PUT } = await import('@/app/api/loyalty/config/route'));
  });

  it('returns 200 on successful config update', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pointsPerPeso: 2 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/loyalty/config', {
      method: 'PUT',
      body: JSON.stringify({ pointsPerPeso: 2 }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when cashier role', async () => {
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pointsPerPeso: 2 }, 'cashier'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when pointsPerPeso is non-positive', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pointsPerPeso: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it('returns 400 when pesoPerPoint is zero', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pesoPerPoint: 0 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when minRedemption is less than 1', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { minRedemption: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least 1/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { isEnabled: false }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/loyalty/adjust
// ---------------------------------------------------------------------------

describe('POST /api/loyalty/adjust', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const validBody = { customerId: 'cust-1', points: 100, description: 'Manual adjustment' };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 });
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockCustomerFindOne.mockResolvedValue({ ...mockCustomer, save: saveMock });
    mockLoyaltyTxCreate.mockResolvedValue([{ _id: 'ltx-1', points: 100 }]);
    mockStartSession.mockResolvedValue({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      abortTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn().mockResolvedValue(undefined),
    });
    ({ POST } = await import('@/app/api/loyalty/adjust/route'));
  });

  it('returns 200 on successful adjustment', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.pointsAdjusted).toBe(100);
  });

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/loyalty/adjust', {
      method: 'POST',
      body: JSON.stringify(validBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when cashier role', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', validBody, 'cashier'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when customerId is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', { points: 100, description: 'x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/customerId/i);
  });

  it('returns 400 when points is zero', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', { customerId: 'c1', points: 0, description: 'x' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-zero/i);
  });

  it('returns 400 when description is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', { customerId: 'c1', points: 50 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('returns 404 when customer not found', async () => {
    mockCustomerFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', validBody));
    expect(res.status).toBe(404);
  });

  it('clamps negative adjustment to zero balance (no negative balance)', async () => {
    // customer has 500 points, deducting 1000 → balanceAfter should be 0
    mockCustomerFindOne.mockResolvedValue({ ...mockCustomer, loyaltyPointsBalance: 500, save: vi.fn() });
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: -1000,
      description: 'Redemption correction',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balanceAfter).toBe(0);
  });

  it('returns 403 when loyalty feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Loyalty program not available')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', validBody));
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', validBody));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/loyalty/customers/[customerId]
// ---------------------------------------------------------------------------

describe('GET /api/loyalty/customers/[customerId]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ customerId: 'cust-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockCustomer) });
    mockLoyaltyTxFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'ltx-1', points: 50, type: 'earn' }]),
    });
    mockLoyaltyTxCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/loyalty/customers/[customerId]/route'));
  });

  it('returns 200 with customer loyalty data and history', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.customerId).toBe('cust-1');
    expect(body.data.loyaltyPointsBalance).toBe(500);
    expect(body.data.history).toHaveLength(1);
    expect(body.data.pagination.total).toBe(1);
  });

  it('returns 401 when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/loyalty/customers/cust-1', { method: 'GET' });
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 404 when customer not found', async () => {
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 403 when loyalty feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not available')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx);
    expect(res.status).toBe(403);
  });

  it('returns empty history when no transactions', async () => {
    mockLoyaltyTxFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockLoyaltyTxCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.history).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
  });
});
