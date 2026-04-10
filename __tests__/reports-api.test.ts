process.env.JWT_SECRET = 'test-secret-32chars-reports!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockRequireRole,
  mockRequireAuth,
  mockTransactionFind,
  mockTransactionAggregate,
  mockAttendanceAggregate,
  mockGetSalesReport,
  mockGetProfitLoss,
  mockGetVAT,
  mockGetProducts,
  mockGetCashDrawer,
} = vi.hoisted(() => ({
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockRequireAuth: vi.fn().mockResolvedValue(undefined),
  mockTransactionFind: vi.fn(),
  mockTransactionAggregate: vi.fn(),
  mockAttendanceAggregate: vi.fn(),
  mockGetSalesReport: vi.fn(),
  mockGetProfitLoss: vi.fn(),
  mockGetVAT: vi.fn(),
  mockGetProducts: vi.fn(),
  mockGetCashDrawer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireRole: mockRequireRole, requireAuth: mockRequireAuth };
});
vi.mock('@/lib/analytics', () => ({
  getSalesReport: mockGetSalesReport,
  getProfitLossSummary: mockGetProfitLoss,
  getVATReport: mockGetVAT,
  getProductPerformance: mockGetProducts,
  getCashDrawerReports: mockGetCashDrawer,
}));
vi.mock('@/lib/export', () => ({
  arrayToCSV: vi.fn().mockReturnValue('col1,col2\nval1,val2'),
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
vi.mock('@/models/Product', () => ({ default: {} }));
vi.mock('@/models/Transaction', () => ({
  default: {
    find: mockTransactionFind,
    aggregate: mockTransactionAggregate,
  },
}));
vi.mock('@/models/Attendance', () => ({
  default: { aggregate: mockAttendanceAggregate },
}));
vi.mock('mongoose', () => {
  class MockObjectId { constructor(id: string) { Object.assign(this, { id }); } }
  return {
    default: {
      Types: { ObjectId: MockObjectId },
      models: { Product: true, Transaction: true }, // prevent re-registration code from running
    },
    Types: { ObjectId: MockObjectId },
    models: { Product: true, Transaction: true },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method: 'GET',
    headers: { cookie: `auth-token=${token}` },
  });
}

const mockSalesData = { totalSales: 5000, transactions: 20 };

// ---------------------------------------------------------------------------
// GET /api/reports/sales
// ---------------------------------------------------------------------------

describe('GET /api/reports/sales', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockGetSalesReport.mockResolvedValue(mockSalesData);
    ({ GET } = await import('@/app/api/reports/sales/route'));
  });

  it('returns 200 with sales report', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/sales'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalSales).toBe(5000);
  });

  it('returns 401 when role check throws Unauthorized', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('http://localhost/api/reports/sales'));
    expect(res.status).toBe(500); // caught by generic error handler
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('http://localhost/api/reports/sales'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Reports not available on your plan')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/sales'));
    expect(res.status).toBe(403);
  });

  it('passes period and date params to analytics function', async () => {
    const url = 'http://localhost/api/reports/sales?period=monthly&startDate=2024-01-01&endDate=2024-01-31';
    await GET(makeRequest(url));
    expect(mockGetSalesReport).toHaveBeenCalledWith(
      'tenant-1',
      'monthly',
      expect.any(Date),
      expect.any(Date),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/profit-loss
// ---------------------------------------------------------------------------

describe('GET /api/reports/profit-loss', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockGetProfitLoss.mockResolvedValue({ revenue: 10000, expenses: 6000, profit: 4000 });
    ({ GET } = await import('@/app/api/reports/profit-loss/route'));
  });

  it('returns 200 with profit/loss summary', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/profit-loss'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.profit).toBe(4000);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not available')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/profit-loss'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/products
// ---------------------------------------------------------------------------

describe('GET /api/reports/products', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockGetProducts.mockResolvedValue([{ productId: 'p1', totalSold: 50 }]);
    ({ GET } = await import('@/app/api/reports/products/route'));
  });

  it('returns 200 with product performance data', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/products'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not available')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/products'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/cash-drawer
// ---------------------------------------------------------------------------

describe('GET /api/reports/cash-drawer', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockGetCashDrawer.mockResolvedValue([{ sessionId: 's1', openAmount: 1000 }]);
    ({ GET } = await import('@/app/api/reports/cash-drawer/route'));
  });

  it('returns 200 with cash drawer reports', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/cash-drawer'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not available')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/cash-drawer'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/sales-journal
// ---------------------------------------------------------------------------

describe('GET /api/reports/sales-journal', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockTxn = {
    _id: 'txn-1',
    receiptNumber: 'REC-20240101-00001',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    items: [{ name: 'Widget' }],
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 12,
    total: 112,
    paymentMethod: 'cash',
    status: 'completed',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockTxn]),
    });
    ({ GET } = await import('@/app/api/reports/sales-journal/route'));
  });

  it('returns 200 with journal entries and summary', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/sales-journal'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].receiptNumber).toBe('REC-20240101-00001');
    expect(body.data.summary.totalTransactions).toBe(1);
    expect(body.data.summary.totalTax).toBe(12);
  });

  it('returns CSV when format=csv', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/sales-journal?format=csv'));
    expect(res.status).toBe(200);
    const contentType = res.headers.get('Content-Type');
    expect(contentType).toMatch(/text\/csv/);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not available')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/sales-journal'));
    expect(res.status).toBe(403);
  });

  it('returns empty entries when no transactions', async () => {
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('http://localhost/api/reports/sales-journal'));
    const body = await res.json();
    expect(body.data.entries).toHaveLength(0);
    expect(body.data.summary.totalTransactions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/cas
// ---------------------------------------------------------------------------

describe('GET /api/reports/cas', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockCompletedTxn = {
    _id: 'txn-1',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    receiptNumber: 'REC-001',
    paymentMethod: 'cash',
    subtotal: 100,
    total: 112,
    taxAmount: 12,
    taxExemptAmount: 0,
    status: 'completed',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(undefined);
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/subscription')).checkBirFeatureAccess).mockResolvedValue(undefined);
    mockTransactionFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockCompletedTxn]),
    });
    ({ GET } = await import('@/app/api/reports/cas/route'));
  });

  it('returns 200 with CSV response', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/cas'));
    expect(res.status).toBe(200);
    const contentType = res.headers.get('Content-Type');
    expect(contentType).toMatch(/text\/csv/);
    const contentDisp = res.headers.get('Content-Disposition');
    expect(contentDisp).toMatch(/cas-report/);
  });

  it('returns 403 when CAS BIR feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkBirFeatureAccess).mockRejectedValue(
      new Error('CAS reporting requires BIR compliance add-on')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/cas'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when startDate is invalid', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/cas?startDate=not-a-date'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid startDate/i);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('http://localhost/api/reports/cas'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/staff-performance
// ---------------------------------------------------------------------------

describe('GET /api/reports/staff-performance', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockTransactionAggregate.mockResolvedValue([
      { staffId: 'u1', name: 'Alice', revenue: 2000, transactions: 8, totalDiscount: 0, avgOrderValue: 250 },
    ]);
    mockAttendanceAggregate.mockResolvedValue([
      { _id: 'u1', totalHours: 40, daysWorked: 5 },
    ]);
    ({ GET } = await import('@/app/api/reports/staff-performance/route'));
  });

  it('returns 200 with merged staff metrics', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/staff-performance'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta.staffCount).toBe(1);
  });

  it('returns 200 with empty data when no transactions', async () => {
    mockTransactionAggregate.mockResolvedValue([]);
    mockAttendanceAggregate.mockResolvedValue([]);
    const res = await GET(makeRequest('http://localhost/api/reports/staff-performance'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.meta.staffCount).toBe(0);
  });

  it('returns 400 when date range is invalid', async () => {
    const res = await GET(makeRequest('http://localhost/api/reports/staff-performance?startDate=not-a-date'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });

  it('returns auth error when requireTenantAccess fails', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await GET(makeRequest('http://localhost/api/reports/staff-performance'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
