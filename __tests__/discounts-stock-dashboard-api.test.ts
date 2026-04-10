process.env.JWT_SECRET = 'test-secret-32chars-discounts1!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockDiscountFindOne,
  mockStockMovementFind,
  mockStockMovementCount,
  mockGetLowStockProducts,
  mockTenantFindById,
  mockTransactionAggregate,
  mockProductCountDocuments,
  mockUserCountDocuments,
  mockBookingCountDocuments,
  mockRequireAuth,
  mockRequireRole,
  mockRequireTenantAccess,
  mockGetTenantIdFromRequest,
  mockCheckRateLimit,
  mockEnsureLegalDiscounts,
  mockGetTenantSettingsById,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockDiscountFindOne: vi.fn(),
  mockStockMovementFind: vi.fn(),
  mockStockMovementCount: vi.fn(),
  mockGetLowStockProducts: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockTransactionAggregate: vi.fn(),
  mockProductCountDocuments: vi.fn(),
  mockUserCountDocuments: vi.fn(),
  mockBookingCountDocuments: vi.fn(),
  mockRequireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
  mockRequireRole: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
  mockRequireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' },
  }),
  mockGetTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 19, resetAfterMs: 0 }),
  mockEnsureLegalDiscounts: vi.fn().mockResolvedValue(undefined),
  mockGetTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true }),
  mockHandleApiError: vi.fn().mockImplementation((_err: unknown, msg: string) =>
    NextResponse.json({ success: false, error: msg }, { status: 500 })
  ),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('mongoose', () => {
  class MockObjectId {
    id: string;
    constructor(id: string) { this.id = id; }
    toString() { return this.id; }
  }
  return {
    default: { Types: { ObjectId: MockObjectId } },
    Types: { ObjectId: MockObjectId },
  };
});

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    DISCOUNT_UPDATE: 'DISCOUNT_UPDATE',
    DISCOUNT_DELETE: 'DISCOUNT_DELETE',
  },
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
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mockGetTenantIdFromRequest,
  requireTenantAccess: mockRequireTenantAccess,
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth, requireRole: mockRequireRole };
});
vi.mock('@/lib/stock', () => ({ getLowStockProducts: mockGetLowStockProducts }));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: mockGetTenantSettingsById }));
vi.mock('@/lib/discount-seeds', () => ({
  ensureLegalDiscounts: mockEnsureLegalDiscounts,
  LEGAL_DISCOUNT_CODES: ['SC20', 'PWD20'],
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/models/Discount', () => ({ default: { findOne: mockDiscountFindOne } }));
vi.mock('@/models/StockMovement', () => ({
  default: { find: mockStockMovementFind, countDocuments: mockStockMovementCount },
}));
vi.mock('@/models/Tenant', () => ({ default: { findById: mockTenantFindById } }));
vi.mock('@/models/Transaction', () => ({ default: { aggregate: mockTransactionAggregate } }));
vi.mock('@/models/Product', () => ({ default: { countDocuments: mockProductCountDocuments } }));
vi.mock('@/models/User', () => ({ default: { countDocuments: mockUserCountDocuments } }));
vi.mock('@/models/Booking', () => ({ default: { countDocuments: mockBookingCountDocuments } }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const DISCOUNT_ID = 'disc-1';

const baseDiscount = {
  _id: DISCOUNT_ID,
  code: 'SAVE10',
  name: 'Save 10%',
  type: 'percentage',
  value: 10,
  minPurchaseAmount: 0,
  maxDiscountAmount: null,
  usageLimit: null,
  usageCount: 0,
  isActive: true,
  tenantId: 'tenant-1',
  validFrom: new Date('2020-01-01'),
  validUntil: new Date('2030-12-31'),
  category: 'general',
  requiresIdVerification: false,
};

// ===========================================================================
// GET /api/discounts/[id]
// ===========================================================================

describe('GET /api/discounts/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: DISCOUNT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockDiscountFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(baseDiscount) });
    ({ GET } = await import('@/app/api/discounts/[id]/route'));
  });

  it('returns 200 with discount', async () => {
    const res = await GET(makeRequest('GET', `http://localhost/api/discounts/${DISCOUNT_ID}`), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('SAVE10');
  });

  it('returns 404 when discount not found', async () => {
    mockDiscountFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET', `http://localhost/api/discounts/${DISCOUNT_ID}`), mockParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/discount not found/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', `http://localhost/api/discounts/${DISCOUNT_ID}`), mockParams);
    expect(res.status).toBe(404);
  });

  it('returns 500 when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', `http://localhost/api/discounts/${DISCOUNT_ID}`), mockParams);
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// PUT /api/discounts/[id]
// ===========================================================================

describe('PUT /api/discounts/[id]', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: DISCOUNT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockDiscountFindOne.mockResolvedValue({
      ...baseDiscount,
      save: vi.fn().mockResolvedValue(undefined),
    });
    ({ PUT } = await import('@/app/api/discounts/[id]/route'));
  });

  it('returns 200 on successful update', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'Updated', isActive: false }),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when trying to change code', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { code: 'NEW_CODE' }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be changed/i);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'x'.repeat(101) }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/100 characters/i);
  });

  it('returns 400 when percentage value exceeds 100', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { value: 110 }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/percentage/i);
  });

  it('returns 400 when end date is before start date', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, {
        validFrom: '2025-12-01',
        validUntil: '2025-01-01',
      }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/end date/i);
  });

  it('returns 404 when discount not found', async () => {
    mockDiscountFindOne.mockResolvedValue(null);
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'x' }),
      mockParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/discount not found/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'x' }),
      mockParams
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// DELETE /api/discounts/[id]
// ===========================================================================

describe('DELETE /api/discounts/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: DISCOUNT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockDiscountFindOne.mockResolvedValue({
      ...baseDiscount,
      deleteOne: vi.fn().mockResolvedValue(undefined),
    });
    ({ DELETE } = await import('@/app/api/discounts/[id]/route'));
  });

  it('returns 200 on successful delete', async () => {
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/discounts/${DISCOUNT_ID}`),
      mockParams
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when discount not found', async () => {
    mockDiscountFindOne.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/discounts/${DISCOUNT_ID}`),
      mockParams
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/discount not found/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest('DELETE', `http://localhost/api/discounts/${DISCOUNT_ID}`),
      mockParams
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /api/discounts/validate
// ===========================================================================

describe('POST /api/discounts/validate', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const activeDiscount = {
    ...baseDiscount,
    validFrom: new Date('2020-01-01'),
    validUntil: new Date('2030-12-31'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 19, resetAfterMs: 0 });
    mockGetTenantSettingsById.mockResolvedValue({ enableDiscounts: true });
    mockDiscountFindOne.mockResolvedValue(activeDiscount);
    ({ POST } = await import('@/app/api/discounts/validate/route'));
  });

  it('returns 200 with calculated discount amount for percentage', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.discountAmount).toBe(10);
    expect(body.data.finalTotal).toBe(90);
  });

  it('returns 200 with correct amount for fixed discount', async () => {
    mockDiscountFindOne.mockResolvedValue({ ...activeDiscount, type: 'fixed', value: 15 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(15);
    expect(body.data.finalTotal).toBe(85);
  });

  it('caps fixed discount at subtotal', async () => {
    mockDiscountFindOne.mockResolvedValue({ ...activeDiscount, type: 'fixed', value: 200 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 50,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(50);
    expect(body.data.finalTotal).toBe(0);
  });

  it('returns 400 when code is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', { subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/code is required/i);
  });

  it('returns 400 when discount not found or inactive', async () => {
    mockDiscountFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'INVALID',
      subtotal: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 when discount is expired', async () => {
    mockDiscountFindOne.mockResolvedValue({
      ...activeDiscount,
      validFrom: new Date('2020-01-01'),
      validUntil: new Date('2021-01-01'),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not valid/i);
  });

  it('returns 400 when usage limit reached', async () => {
    mockDiscountFindOne.mockResolvedValue({ ...activeDiscount, usageLimit: 10, usageCount: 10 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/usage limit/i);
  });

  it('returns 400 when minimum purchase amount not met', async () => {
    mockDiscountFindOne.mockResolvedValue({ ...activeDiscount, minPurchaseAmount: 200 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/minimum purchase/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(429);
  });

  it('auto-seeds legal discounts when SC20 code is used', async () => {
    mockDiscountFindOne.mockResolvedValue({ ...activeDiscount, code: 'SC20', value: 20 });
    await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SC20',
      subtotal: 100,
    }));
    expect(mockEnsureLegalDiscounts).toHaveBeenCalledWith('tenant-1');
  });

  it('returns 400 when discounts disabled for non-legal code', async () => {
    mockGetTenantSettingsById.mockResolvedValue({ enableDiscounts: false });
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/validate', {
      code: 'SAVE10',
      subtotal: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not enabled/i);
  });
});

// ===========================================================================
// POST /api/discounts/seed-defaults
// ===========================================================================

describe('POST /api/discounts/seed-defaults', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', role: 'admin' },
    });
    mockEnsureLegalDiscounts.mockResolvedValue(undefined);
    ({ POST } = await import('@/app/api/discounts/seed-defaults/route'));
  });

  it('returns 200 and seeds legal discounts', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/seed-defaults'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/SC20|PWD20/i);
    expect(mockEnsureLegalDiscounts).toHaveBeenCalledWith('tenant-1');
  });

  it('returns error when unauthenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts/seed-defaults'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ===========================================================================
// GET /api/stock-movements
// ===========================================================================

describe('GET /api/stock-movements', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockMovements = [
    {
      _id: 'mov-1',
      type: 'sale',
      quantity: 2,
      productId: { name: 'Widget', sku: 'W1' },
      tenantId: 'tenant-1',
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockStockMovementFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockMovements),
    });
    mockStockMovementCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/stock-movements/route'));
  });

  it('returns 200 with movements and pagination', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/stock-movements'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.page).toBe(1);
  });

  it('returns 200 with empty list', async () => {
    mockStockMovementFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockStockMovementCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/stock-movements'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/stock-movements'));
    expect(res.status).toBe(404);
  });

  it('filters by productId query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/stock-movements?productId=prod-1'));
    expect(mockStockMovementFind).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-1' })
    );
  });

  it('filters by type query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/stock-movements?type=sale'));
    expect(mockStockMovementFind).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sale' })
    );
  });
});

// ===========================================================================
// GET /api/inventory/low-stock
// ===========================================================================

describe('GET /api/inventory/low-stock', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockLowStockProducts = [
    { _id: 'prod-1', name: 'Widget', stock: 2, lowStockThreshold: 5 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockTenantFindById.mockResolvedValue({ settings: { lowStockThreshold: 10 } });
    mockGetLowStockProducts.mockResolvedValue(mockLowStockProducts);
    ({ GET } = await import('@/app/api/inventory/low-stock/route'));
  });

  it('returns 200 with low stock products', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/inventory/low-stock'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.threshold).toBe(10);
    expect(body.count).toBe(1);
  });

  it('uses custom threshold from query param', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/inventory/low-stock?threshold=5'));
    expect(mockGetLowStockProducts).toHaveBeenCalledWith('tenant-1', undefined, 5);
  });

  it('uses default threshold of 10 when tenant has no settings', async () => {
    mockTenantFindById.mockResolvedValue(null);
    await GET(makeRequest('GET', 'http://localhost/api/inventory/low-stock'));
    expect(mockGetLowStockProducts).toHaveBeenCalledWith('tenant-1', undefined, 10);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/inventory/low-stock'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with empty list when no low-stock items', async () => {
    mockGetLowStockProducts.mockResolvedValue([]);
    const res = await GET(makeRequest('GET', 'http://localhost/api/inventory/low-stock'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

// ===========================================================================
// GET /api/dashboard/summary
// ===========================================================================

describe('GET /api/dashboard/summary', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  function setupDashboard(opts: {
    todayTx?: object[];
    monthTx?: object[];
    trend?: object[];
    topProducts?: object[];
    lowStock?: number;
    activeStaff?: number;
    pendingBookings?: number;
  } = {}) {
    const {
      todayTx = [{ revenue: 500, count: 5, totalDiscount: 10 }],
      monthTx = [{ revenue: 10000, count: 100 }],
      trend = [],
      topProducts = [{ _id: 'prod-1', name: 'Widget', revenue: 300, quantity: 30 }],
      lowStock = 3,
      activeStaff = 5,
      pendingBookings = 2,
    } = opts;
    mockTransactionAggregate
      .mockResolvedValueOnce(todayTx)
      .mockResolvedValueOnce(monthTx)
      .mockResolvedValueOnce(trend)
      .mockResolvedValueOnce(topProducts);
    mockProductCountDocuments.mockResolvedValue(lowStock);
    mockUserCountDocuments.mockResolvedValue(activeStaff);
    mockBookingCountDocuments.mockResolvedValue(pendingBookings);
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', role: 'admin' },
    });
    ({ GET } = await import('@/app/api/dashboard/summary/route'));
  });

  it('returns 200 with complete dashboard summary', async () => {
    setupDashboard();
    const res = await GET(makeRequest('GET', 'http://localhost/api/dashboard/summary'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.today.revenue).toBe(500);
    expect(body.data.today.transactions).toBe(5);
    expect(body.data.today.totalDiscount).toBe(10);
    expect(body.data.month.revenue).toBe(10000);
    expect(body.data.month.transactions).toBe(100);
    expect(body.data.alerts.lowStock).toBe(3);
    expect(body.data.alerts.activeStaff).toBe(5);
    expect(body.data.alerts.pendingBookings).toBe(2);
    expect(body.data.generatedAt).toBeDefined();
  });

  it('returns zeros when no transactions exist', async () => {
    setupDashboard({
      todayTx: [],
      monthTx: [],
      trend: [],
      topProducts: [],
      lowStock: 0,
      activeStaff: 0,
      pendingBookings: 0,
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/dashboard/summary'));
    const body = await res.json();
    expect(body.data.today.revenue).toBe(0);
    expect(body.data.today.transactions).toBe(0);
    expect(body.data.today.avgOrderValue).toBe(0);
    expect(body.data.month.revenue).toBe(0);
  });

  it('calculates avgOrderValue correctly', async () => {
    setupDashboard({ todayTx: [{ revenue: 200, count: 4, totalDiscount: 0 }] });
    const res = await GET(makeRequest('GET', 'http://localhost/api/dashboard/summary'));
    const body = await res.json();
    expect(body.data.today.avgOrderValue).toBe(50);
  });

  it('returns error when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/dashboard/summary'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
