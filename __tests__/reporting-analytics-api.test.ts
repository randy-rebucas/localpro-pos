process.env.JWT_SECRET = 'test-secret-32chars-reporting!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockRequireAuth,
  mockRequireRole,
  mockGetTenantIdFromRequest,
  mockRequireTenantAccess,
  mockCheckFeatureAccess,
  mockCheckBirFeatureAccess,
  mockGetSalesReport,
  mockGetProfitLossSummary,
  mockGetVATReport,
  mockGetProductPerformance,
  mockGetCashDrawerReports,
  mockArrayToCSV,
  mockTransactionFind,
  mockTransactionAggregate,
  mockAttendanceAggregate,
  mockTenantFindById,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
  mockRequireRole: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' }),
  mockGetTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  mockRequireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant-1', user: { userId: 'user-1', role: 'admin' } }),
  mockCheckFeatureAccess: vi.fn().mockResolvedValue(undefined),
  mockCheckBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
  mockGetSalesReport: vi.fn(),
  mockGetProfitLossSummary: vi.fn(),
  mockGetVATReport: vi.fn(),
  mockGetProductPerformance: vi.fn(),
  mockGetCashDrawerReports: vi.fn(),
  mockArrayToCSV: vi.fn().mockReturnValue('col1,col2\nval1,val2\n'),
  mockTransactionFind: vi.fn(),
  mockTransactionAggregate: vi.fn(),
  mockAttendanceAggregate: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockHandleApiError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((key: string, fallback: string) => fallback),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth, requireRole: mockRequireRole };
});
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mockGetTenantIdFromRequest,
  requireTenantAccess: mockRequireTenantAccess,
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
  checkBirFeatureAccess: mockCheckBirFeatureAccess,
}));
vi.mock('@/lib/analytics', () => ({
  getSalesReport: mockGetSalesReport,
  getProfitLossSummary: mockGetProfitLossSummary,
  getVATReport: mockGetVATReport,
  getProductPerformance: mockGetProductPerformance,
  getCashDrawerReports: mockGetCashDrawerReports,
}));
vi.mock('@/lib/export', () => ({ arrayToCSV: mockArrayToCSV }));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findById: mockTenantFindById },
}));
vi.mock('@/models/Product', () => ({
  default: { modelName: 'Product', find: vi.fn() },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: mockTransactionFind, aggregate: mockTransactionAggregate },
}));
vi.mock('@/models/Attendance', () => ({
  default: { aggregate: mockAttendanceAggregate },
}));
vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return { ...actual, default: actual.default };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: `auth-token=${token}`,
    },
  });
}

function makeChain<T>(value: T) {
  const chain: any = {};
  ['populate', 'sort', 'limit', 'skip', 'select'].forEach(m => { chain[m] = () => chain; });
  chain.lean = () => Promise.resolve(value);
  chain.then = (resolve: any) => Promise.resolve(value).then(resolve);
  return chain;
}

function makeErrorResponse(msg: string, status = 500): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ===========================================================================
// GET /api/reports/sales
// ===========================================================================

describe('GET /api/reports/sales', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const salesData = { period: 'daily', totalRevenue: 5000, totalTransactions: 20, data: [] };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockGetSalesReport.mockResolvedValue(salesData);
    ({ GET } = await import('@/app/api/reports/sales/route'));
  });

  it('returns sales report data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(salesData);
  });

  it('passes period param to getSalesReport', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/sales?period=monthly'));
    expect(mockGetSalesReport).toHaveBeenCalledWith('tenant-1', 'monthly', undefined, undefined);
  });

  it('passes date range to getSalesReport', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/sales?startDate=2026-04-01&endDate=2026-04-30'));
    const [, , start, end] = mockGetSalesReport.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Feature not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Feature not enabled');
  });

  it('returns 500 when analytics throws', async () => {
    mockGetSalesReport.mockRejectedValue(new Error('DB error'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales'));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// GET /api/reports/profit-loss
// ===========================================================================

describe('GET /api/reports/profit-loss', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const plData = { revenue: 10000, expenses: 6000, profit: 4000, margin: 40 };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockGetProfitLossSummary.mockResolvedValue(plData);
    ({ GET } = await import('@/app/api/reports/profit-loss/route'));
  });

  it('returns profit & loss summary', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/profit-loss'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.profit).toBe(4000);
  });

  it('passes date range from query params', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/profit-loss?startDate=2026-01-01&endDate=2026-03-31'));
    const [, start, end] = mockGetProfitLossSummary.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(start.toISOString().startsWith('2026-01-01')).toBe(true);
  });

  it('uses 30-day default when no dates provided', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/profit-loss'));
    const [, start, end] = mockGetProfitLossSummary.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(28);
    expect(diffDays).toBeLessThan(32);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/profit-loss'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Reports not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/profit-loss'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/reports/vat
// ===========================================================================

describe('GET /api/reports/vat', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const vatData = { vatableSales: 9000, vatAmount: 1080, vatExemptSales: 1000, totalSales: 10000 };
  const tenantDoc = { _id: 'tenant-1', settings: { vatRate: 12 } };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockTenantFindById.mockReturnValue(makeChain(tenantDoc));
    mockGetVATReport.mockResolvedValue(vatData);
    ({ GET } = await import('@/app/api/reports/vat/route'));
  });

  it('returns VAT report data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/vat'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.vatAmount).toBe(1080);
  });

  it('passes tenant settings to getVATReport', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/vat'));
    const [, , , settings] = mockGetVATReport.mock.calls[0];
    expect(settings).toEqual({ vatRate: 12 });
  });

  it('returns 404 when tenant not found in DB', async () => {
    mockTenantFindById.mockReturnValue(makeChain(null));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/vat'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Feature disabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/vat'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/reports/products
// ===========================================================================

describe('GET /api/reports/products', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const productData = [
    { productId: 'p-1', name: 'Coffee', unitsSold: 100, revenue: 1500 },
    { productId: 'p-2', name: 'Tea', unitsSold: 50, revenue: 500 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockGetProductPerformance.mockResolvedValue(productData);
    ({ GET } = await import('@/app/api/reports/products/route'));
  });

  it('returns product performance data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/products'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('passes limit param to getProductPerformance', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/products?limit=5'));
    const [, , , limit] = mockGetProductPerformance.mock.calls[0];
    expect(limit).toBe(5);
  });

  it('defaults to limit=10', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/products'));
    const [, , , limit] = mockGetProductPerformance.mock.calls[0];
    expect(limit).toBe(10);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/products'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/reports/cash-drawer
// ===========================================================================

describe('GET /api/reports/cash-drawer', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const drawerReports = [
    { sessionId: 's-1', openedBy: 'Alice', total: 5000, shortage: 0 },
    { sessionId: 's-2', openedBy: 'Bob', total: 3000, shortage: 50 },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockGetCashDrawerReports.mockResolvedValue(drawerReports);
    ({ GET } = await import('@/app/api/reports/cash-drawer/route'));
  });

  it('returns cash drawer reports', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cash-drawer'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('passes date range to getCashDrawerReports', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/cash-drawer?startDate=2026-04-01&endDate=2026-04-30'));
    const [, start, end] = mockGetCashDrawerReports.mock.calls[0];
    expect(start.toISOString().startsWith('2026-04-01')).toBe(true);
    expect(end.toISOString().startsWith('2026-04-30')).toBe(true);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cash-drawer'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Feature not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cash-drawer'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// GET /api/reports/sales-journal
// ===========================================================================

describe('GET /api/reports/sales-journal', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const makeTransaction = (id: string, total: number, taxAmount = 0, discountAmount = 0) => ({
    _id: id,
    receiptNumber: `RN-${id}`,
    createdAt: new Date('2026-04-09T10:00:00Z'),
    items: [{ name: 'Coffee' }, { name: 'Tea' }],
    subtotal: total,
    discountCategory: discountAmount > 0 ? 'SC' : '',
    discountAmount,
    taxExemptAmount: 0,
    taxAmount,
    total,
    paymentMethod: 'cash',
    status: 'completed',
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockTransactionFind.mockReturnValue(makeChain([
      makeTransaction('tx-1', 1000, 120, 0),
      makeTransaction('tx-2', 500, 60, 50),
    ]));
    ({ GET } = await import('@/app/api/reports/sales-journal/route'));
  });

  it('returns journal entries with summary (JSON format)', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.entries).toHaveLength(2);
    expect(body.data.summary.totalTransactions).toBe(2);
    expect(body.data.summary.totalSales).toBe(1500);
    expect(body.data.summary.totalTax).toBe(180);
    expect(body.data.summary.totalDiscounts).toBe(50);
  });

  it('maps transaction fields to journal entry format', async () => {
    mockTransactionFind.mockReturnValue(makeChain([makeTransaction('tx-1', 1000, 120, 0)]));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal'));
    const body = await res.json();
    const entry = body.data.entries[0];
    expect(entry.receiptNumber).toBe('RN-tx-1');
    expect(entry.items).toBe('Coffee; Tea');
    expect(entry.itemCount).toBe(2);
    expect(entry.paymentMethod).toBe('cash');
  });

  it('returns CSV when format=csv', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal?format=csv'));
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('sales-journal');
    expect(res.headers.get('Content-Disposition')).toContain('.csv');
    const text = await res.text();
    expect(text).toBe('col1,col2\nval1,val2\n');
  });

  it('passes date range to Transaction.find', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal?startDate=2026-04-01&endDate=2026-04-30'));
    const query = mockTransactionFind.mock.calls[0][0];
    expect(query.createdAt.$gte.toISOString().startsWith('2026-04-01')).toBe(true);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when feature is disabled', async () => {
    mockCheckFeatureAccess.mockRejectedValue(new Error('Reports not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal'));
    expect(res.status).toBe(403);
  });

  it('returns empty summary for no transactions', async () => {
    mockTransactionFind.mockReturnValue(makeChain([]));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/sales-journal'));
    const body = await res.json();
    expect(body.data.summary.totalTransactions).toBe(0);
    expect(body.data.summary.totalSales).toBe(0);
  });
});

// ===========================================================================
// GET /api/reports/cas
// ===========================================================================

describe('GET /api/reports/cas', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const makeCasTx = (id: string, total: number, taxAmount = 0, taxExemptAmount = 0) => ({
    _id: id,
    createdAt: new Date('2026-04-09T10:00:00Z'),
    receiptNumber: `OR-${id}`,
    paymentMethod: 'cash',
    subtotal: total,
    total,
    taxAmount,
    taxExemptAmount,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockRequireRole.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantIdFromRequest.mockResolvedValue('tenant-1');
    mockCheckBirFeatureAccess.mockResolvedValue(undefined);
    mockTransactionFind.mockReturnValue(makeChain([
      makeCasTx('tx-1', 1120, 120, 0),
    ]));
    ({ GET } = await import('@/app/api/reports/cas/route'));
  });

  it('returns CSV with correct Content-Type', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('cas-report');
  });

  it('calls arrayToCSV with CAS headers', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    expect(mockArrayToCSV).toHaveBeenCalled();
    const [entries, headers] = mockArrayToCSV.mock.calls[0];
    expect(headers).toContain('vatableSales');
    expect(headers).toContain('vatAmount');
    expect(headers).toContain('vatExemptSales');
    expect(headers).toContain('receiptNumber');
  });

  it('calculates vatableSales correctly', async () => {
    // total=1120, taxAmount=120, taxExemptAmount=0 → vatableSales = 1120 - 0 - 120 = 1000
    mockTransactionFind.mockReturnValue(makeChain([makeCasTx('tx-1', 1120, 120, 0)]));
    await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    const [entries] = mockArrayToCSV.mock.calls[0];
    expect(entries[0].vatableSales).toBe(1000);
    expect(entries[0].vatAmount).toBe(120);
    expect(entries[0].debit).toBe(1120);
  });

  it('clamps vatableSales to 0 when subtotal < taxExemptAmount + taxAmount', async () => {
    // subtotal=100, taxExemptAmount=80, taxAmount=40 → 100-80-40 = -20 → clamped to 0
    const tx = { ...makeCasTx('tx-1', 100, 40, 80), subtotal: 100 };
    mockTransactionFind.mockReturnValue(makeChain([tx]));
    await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    const [entries] = mockArrayToCSV.mock.calls[0];
    expect(entries[0].vatableSales).toBe(0);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantIdFromRequest.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when CAS feature is disabled', async () => {
    mockCheckBirFeatureAccess.mockRejectedValue(new Error('CAS not enabled'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('CAS not enabled');
  });

  it('returns 400 for invalid startDate', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas?startDate=not-a-date'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid startDate/i);
  });

  it('returns 400 for invalid endDate', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas?endDate=bad'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid endDate/i);
  });

  it('includes date range in Content-Disposition filename', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/cas?startDate=2026-04-01&endDate=2026-04-30'));
    const cd = res.headers.get('Content-Disposition') || '';
    expect(cd).toContain('2026-04-01');
    expect(cd).toContain('2026-04-30');
  });
});

// ===========================================================================
// GET /api/reports/staff-performance
// ===========================================================================

describe('GET /api/reports/staff-performance', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  // Must use valid 24-hex ObjectId — route calls new mongoose.Types.ObjectId(tenantId)
  const TENANT_OBJ_ID = '507f191e810c19729de860ea';
  const STAFF_ID = '507f1f77bcf86cd799439011';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: TENANT_OBJ_ID,
      user: { userId: 'user-1', role: 'admin' },
    });
    mockTransactionAggregate.mockResolvedValue([
      {
        _id: STAFF_ID,
        staffId: STAFF_ID,
        name: 'Alice',
        email: 'alice@test.com',
        role: 'cashier',
        revenue: 8000,
        transactions: 40,
        totalDiscount: 200,
        avgOrderValue: 200,
      },
    ]);
    mockAttendanceAggregate.mockResolvedValue([
      { _id: STAFF_ID, totalHours: 80, daysWorked: 10 },
    ]);
    mockHandleApiError.mockImplementation((err: any, msg: string) => makeErrorResponse(msg));
    ({ GET } = await import('@/app/api/reports/staff-performance/route'));
  });

  it('returns merged staff performance data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/staff-performance'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Alice');
    expect(body.data[0].revenue).toBe(8000);
  });

  it('calculates revenuePerHour when attendance exists', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/staff-performance'));
    const body = await res.json();
    // revenue=8000, totalHours=80 → revenuePerHour = 100
    expect(body.data[0].revenuePerHour).toBe(100);
    expect(body.data[0].totalHours).toBe(80);
    expect(body.data[0].daysWorked).toBe(10);
  });

  it('sets revenuePerHour=null and hours=0 when no attendance data', async () => {
    mockAttendanceAggregate.mockResolvedValue([]); // no attendance records
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/staff-performance'));
    const body = await res.json();
    expect(body.data[0].revenuePerHour).toBeNull();
    expect(body.data[0].totalHours).toBe(0);
    expect(body.data[0].daysWorked).toBe(0);
  });

  it('includes meta with staffCount and date range', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/reports/staff-performance'));
    const body = await res.json();
    expect(body.meta.staffCount).toBe(1);
    expect(body.meta.startDate).toBeDefined();
    expect(body.meta.endDate).toBeDefined();
  });

  it('passes date range from query params', async () => {
    const url = `http://localhost/api/reports/staff-performance?startDate=2026-04-01&endDate=2026-04-30`;
    await GET(makeRequest('GET', url));
    const txPipeline = mockTransactionAggregate.mock.calls[0][0];
    const matchStage = txPipeline[0].$match;
    expect(matchStage.createdAt.$gte.toISOString().startsWith('2026-04-01')).toBe(true);
  });

  it('returns 400 for invalid date range', async () => {
    const res = await GET(makeRequest('GET',
      'http://localhost/api/reports/staff-performance?startDate=not-a-date'
    ));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid date/i);
  });

  it('delegates to handleApiError on exception', async () => {
    mockTransactionAggregate.mockRejectedValue(new Error('Aggregation failed'));
    await GET(makeRequest('GET', 'http://localhost/api/reports/staff-performance'));
    expect(mockHandleApiError).toHaveBeenCalled();
  });
});
