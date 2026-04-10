/**
 * Loyalty program — deeper coverage for:
 *  - POST /api/loyalty/adjust: balance math, description trimming, session abort on error, audit log
 *  - PUT /api/loyalty/config: upsert when no config exists, isEnabled toggle, multiple fields, audit log
 *  - GET /api/loyalty/customers/[customerId]: pagination params, customerName, limit clamping
 */

process.env.JWT_SECRET = 'test-secret-32chars-loyaltydeep!';
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
  mockSession,
  mockStartSession,
  mockCheckRateLimit,
  mockCheckFeatureAccess,
  mockGetTenantId,
  mockCreateAuditLog,
  mockHandleApiError,
} = vi.hoisted(() => {
  const mockSession = {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockConfigFindOne: vi.fn(),
    mockConfigFindOneAndUpdate: vi.fn(),
    mockCustomerFindOne: vi.fn(),
    mockLoyaltyTxFind: vi.fn(),
    mockLoyaltyTxCreate: vi.fn(),
    mockLoyaltyTxCount: vi.fn(),
    mockSession,
    mockStartSession: vi.fn().mockResolvedValue(mockSession),
    mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 }),
    mockCheckFeatureAccess: vi.fn().mockResolvedValue(undefined),
    mockGetTenantId: vi.fn().mockResolvedValue('tenant-1'),
    mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
    mockHandleApiError: vi.fn().mockImplementation((_err: unknown, msg: string) => {
      const { NextResponse } = require('next/server');
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { UPDATE: 'UPDATE' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/subscription', () => ({ checkFeatureAccess: mockCheckFeatureAccess }));
vi.mock('@/lib/api-tenant', () => ({ getTenantIdFromRequest: mockGetTenantId }));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return {
    ...actual,
    default: { ...actual.default, startSession: mockStartSession },
    startSession: mockStartSession,
  };
});
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

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'cust-1',
    firstName: 'Jane',
    lastName: 'Smith',
    tenantId: 'tenant-1',
    loyaltyPointsBalance: 500,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ===========================================================================
// POST /api/loyalty/adjust — balance math & session behaviour
// ===========================================================================

describe('POST /api/loyalty/adjust — balance math', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockStartSession.mockResolvedValue({
      ...mockSession,
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      abortTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn().mockResolvedValue(undefined),
    });
    mockLoyaltyTxCreate.mockResolvedValue([{ _id: 'ltx-1', points: 100 }]);
    ({ POST } = await import('@/app/api/loyalty/adjust/route'));
  });

  it('records correct balanceBefore and balanceAfter on positive adjustment', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer({ loyaltyPointsBalance: 300 }));
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 200,
      description: 'Bonus points',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balanceBefore).toBe(300);
    expect(body.data.balanceAfter).toBe(500);
    expect(body.data.pointsAdjusted).toBe(200);
  });

  it('records correct balanceBefore and balanceAfter on negative adjustment', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer({ loyaltyPointsBalance: 400 }));
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: -150,
      description: 'Redemption',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balanceBefore).toBe(400);
    expect(body.data.balanceAfter).toBe(250);
  });

  it('clamps balanceAfter to 0 when deduction exceeds current balance', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer({ loyaltyPointsBalance: 100 }));
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: -999,
      description: 'Over-deduction',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balanceBefore).toBe(100);
    expect(body.data.balanceAfter).toBe(0);
  });

  it('treats null loyaltyPointsBalance as 0', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer({ loyaltyPointsBalance: null }));
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 50,
      description: 'First points',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balanceBefore).toBe(0);
    expect(body.data.balanceAfter).toBe(50);
  });

  it('trims whitespace from description before saving', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer());
    await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 10,
      description: '  Promo award  ',
    }));
    expect(mockLoyaltyTxCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ description: 'Promo award' }),
      ]),
      expect.anything()
    );
  });

  it('returns 400 when description is all whitespace', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer());
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 10,
      description: '   ',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('includes loyaltyTransactionId in response', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer());
    mockLoyaltyTxCreate.mockResolvedValue([{ _id: 'ltx-abc' }]);
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 10,
      description: 'Test',
    }));
    const body = await res.json();
    expect(body.data.loyaltyTransactionId).toBe('ltx-abc');
  });

  it('records audit log with balanceBefore, balanceAfter, and points', async () => {
    mockCustomerFindOne.mockResolvedValue(makeCustomer({ loyaltyPointsBalance: 100 }));
    await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 50,
      description: 'Audit test',
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({
          balanceBefore: 100,
          balanceAfter: 150,
          points: 50,
        }),
      })
    );
  });
});

describe('POST /api/loyalty/adjust — MongoDB session handling', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 });
    mockGetTenantId.mockResolvedValue('tenant-1');
    ({ POST } = await import('@/app/api/loyalty/adjust/route'));
  });

  it('aborts transaction and calls endSession on LoyaltyTransaction.create failure', async () => {
    const abortFn = vi.fn().mockResolvedValue(undefined);
    const endFn = vi.fn().mockResolvedValue(undefined);
    mockStartSession.mockResolvedValue({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      abortTransaction: abortFn,
      endSession: endFn,
    });
    mockCustomerFindOne.mockResolvedValue(makeCustomer());
    mockLoyaltyTxCreate.mockRejectedValue(new Error('DB write failed'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 50,
      description: 'Test',
    }));
    expect(abortFn).toHaveBeenCalled();
    expect(endFn).toHaveBeenCalled();
    expect(res.status).toBe(500);
  });

  it('calls endSession even when commitTransaction throws', async () => {
    const endFn = vi.fn().mockResolvedValue(undefined);
    mockStartSession.mockResolvedValue({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockRejectedValue(new Error('Commit failed')),
      abortTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: endFn,
    });
    mockCustomerFindOne.mockResolvedValue(makeCustomer());
    mockLoyaltyTxCreate.mockResolvedValue([{ _id: 'ltx-1' }]);
    await POST(makeRequest('POST', 'http://localhost/api/loyalty/adjust', {
      customerId: 'cust-1',
      points: 50,
      description: 'Test',
    }));
    expect(endFn).toHaveBeenCalled();
  });
});

// ===========================================================================
// PUT /api/loyalty/config — upsert, multiple fields, audit log
// ===========================================================================

describe('PUT /api/loyalty/config — upsert and audit', () => {
  let PUT: (req: NextRequest) => Promise<Response>;

  const baseConfig = {
    _id: 'cfg-1',
    tenantId: 'tenant-1',
    pointsPerPeso: 1,
    pesoPerPoint: 0.1,
    minRedemption: 100,
    isEnabled: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAfterMs: 0 });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockConfigFindOneAndUpdate.mockResolvedValue(baseConfig);
    ({ PUT } = await import('@/app/api/loyalty/config/route'));
  });

  it('updates isEnabled to false', async () => {
    mockConfigFindOneAndUpdate.mockResolvedValue({ ...baseConfig, isEnabled: false });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { isEnabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.isEnabled).toBe(false);
  });

  it('updates multiple fields in one request', async () => {
    const updated = { ...baseConfig, pointsPerPeso: 2, minRedemption: 50, isEnabled: false };
    mockConfigFindOneAndUpdate.mockResolvedValue(updated);
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', {
      pointsPerPeso: 2,
      minRedemption: 50,
      isEnabled: false,
    }));
    expect(res.status).toBe(200);
    expect(mockConfigFindOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      { $set: expect.objectContaining({ pointsPerPeso: 2, minRedemption: 50, isEnabled: false }) },
      { upsert: true, new: true }
    );
  });

  it('uses upsert — creates config when none exists', async () => {
    const newConfig = { ...baseConfig, _id: 'cfg-new' };
    mockConfigFindOneAndUpdate.mockResolvedValue(newConfig);
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pointsPerPeso: 3 }));
    expect(res.status).toBe(200);
    const callArgs = mockConfigFindOneAndUpdate.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ upsert: true, new: true });
  });

  it('records audit log with the applied updates', async () => {
    await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { pesoPerPoint: 0.25 }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'loyalty_config',
        changes: expect.objectContaining({ pesoPerPoint: 0.25 }),
      })
    );
  });

  it('returns 400 when pointsPerPeso is not a number', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', {
      pointsPerPeso: 'lots',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it('returns 400 when pesoPerPoint is not a number', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', {
      pesoPerPoint: 'half',
    }));
    expect(res.status).toBe(400);
  });

  it('ignores undefined fields — does not include them in $set', async () => {
    await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { isEnabled: true }));
    const setPayload = mockConfigFindOneAndUpdate.mock.calls[0][1].$set;
    expect(setPayload).not.toHaveProperty('pointsPerPeso');
    expect(setPayload).not.toHaveProperty('pesoPerPoint');
    expect(setPayload).not.toHaveProperty('minRedemption');
    expect(setPayload).toHaveProperty('isEnabled', true);
  });

  it('returns 403 for manager role', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/loyalty/config', { isEnabled: true }, 'manager'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/loyalty/customers/[customerId] — pagination and response shape
// ===========================================================================

describe('GET /api/loyalty/customers/[customerId] — pagination', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ customerId: string }> }) => Promise<Response>;

  const ctx = (id = 'cust-1') => ({ params: Promise.resolve({ customerId: id }) });

  const txHistory = Array.from({ length: 5 }, (_, i) => ({
    _id: `ltx-${i}`,
    points: (i + 1) * 10,
    type: 'earn',
  }));

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockCustomerFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeCustomer()),
    });
    mockLoyaltyTxFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(txHistory),
    });
    mockLoyaltyTxCount.mockResolvedValue(25);
    ({ GET } = await import('@/app/api/loyalty/customers/[customerId]/route'));
  });

  it('returns correct customerName from firstName + lastName', async () => {
    mockCustomerFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeCustomer({ firstName: 'John', lastName: 'Doe' })),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx());
    const body = await res.json();
    expect(body.data.customerName).toBe('John Doe');
  });

  it('returns correct pagination when page and limit params are given', async () => {
    const res = await GET(
      makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1?page=2&limit=5'),
      ctx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pagination.page).toBe(2);
    expect(body.data.pagination.limit).toBe(5);
    expect(body.data.pagination.total).toBe(25);
    expect(body.data.pagination.totalPages).toBe(5); // ceil(25/5)
  });

  it('clamps limit to max 100', async () => {
    await GET(
      makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1?limit=999'),
      ctx()
    );
    const chainResult = mockLoyaltyTxFind.mock.results[0].value;
    expect(chainResult.limit).toHaveBeenCalledWith(100);
  });

  it('defaults to page 1 and limit 20', async () => {
    mockLoyaltyTxCount.mockResolvedValue(50);
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx());
    const body = await res.json();
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.limit).toBe(20);
    expect(body.data.pagination.totalPages).toBe(3); // ceil(50/20)
  });

  it('echoes customerId from the route param', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-99'), ctx('cust-99'));
    const body = await res.json();
    expect(body.data.customerId).toBe('cust-99');
  });

  it('returns loyaltyPointsBalance of 0 when customer has no balance', async () => {
    mockCustomerFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue(makeCustomer({ loyaltyPointsBalance: undefined })),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/loyalty/customers/cust-1'), ctx());
    const body = await res.json();
    expect(body.data.loyaltyPointsBalance).toBe(0);
  });
});
