/**
 * Section 18 — Reports
 * Tests: 18.1 – 18.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
  requireRole: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
  checkBirFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/analytics', () => ({
  getSalesReport: vi.fn().mockResolvedValue({
    period: 'daily',
    totalSales: 15000,
    totalTransactions: 42,
    byDay: [{ date: '2026-01-01', sales: 5000, transactions: 14 }],
  }),
  getProductPerformance: vi.fn().mockResolvedValue([
    { productId: 'p1', name: 'Coffee', totalSold: 120, revenue: 6000 },
    { productId: 'p2', name: 'Tea', totalSold: 80, revenue: 3200 },
  ]),
  getCashDrawerReports: vi.fn().mockResolvedValue([
    {
      sessionId: 'session1',
      openingAmount: 500,
      closingAmount: 700,
      expectedAmount: 750,
      shortage: 50,
      date: '2026-01-01',
    },
  ]),
  getProfitLossSummary: vi.fn().mockResolvedValue({
    revenue: { total: 15000 },
    expenses: { total: 3000, byCategory: [] },
    grossProfit: 12000,
    netProfit: 9000,
  }),
  getVATReport: vi.fn().mockResolvedValue({
    vatableSales: 10000,
    vatAmount: 1200,
    vatExemptSales: 500,
    zeroRatedSales: 200,
    byPeriod: [{ period: '2026-01', vatAmount: 1200 }],
  }),
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn() },
}));
vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), modelName: 'Product' },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: vi.fn(),
  },
}));
vi.mock('@/lib/export', () => ({
  arrayToCSV: vi.fn().mockReturnValue('date,receiptNumber,total\n2026-01-01,REC001,500\n'),
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth, requireRole } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { checkFeatureAccess, checkBirFeatureAccess } from '@/lib/subscription';
import { getSalesReport, getProductPerformance, getCashDrawerReports, getVATReport } from '@/lib/analytics';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';

const mockTenant = {
  _id: TENANT_ID,
  name: 'Test Tenant',
  settings: { vatRate: 12, vatRegistered: true },
};

const mockTransaction = {
  _id: 'txn1',
  tenantId: TENANT_ID,
  receiptNumber: 'REC001',
  createdAt: new Date('2026-01-01T10:00:00Z'),
  items: [{ name: 'Coffee', qty: 2, price: 150 }],
  subtotal: 280,
  total: 300,
  taxAmount: 20,
  taxExemptAmount: 0,
  discountAmount: 0,
  discountCategory: '',
  paymentMethod: 'cash',
  status: 'completed',
};

const req = (method: string, url: string) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok' },
  });

// ── 18.1  GET /api/reports/sales ──────────────────────────────────────────
describe('GET /api/reports/sales (18.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(getSalesReport).mockResolvedValue({
      period: 'daily',
      totalSales: 15000,
      totalTransactions: 42,
      byDay: [{ date: '2026-01-01', sales: 5000, transactions: 14 }],
    } as any);
  });

  it('returns sales report with totals', async () => {
    const { GET } = await import('@/app/api/reports/sales/route');
    const res = await GET(req('GET', '/api/reports/sales?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalSales).toBe(15000);
    expect(body.data.totalTransactions).toBe(42);
  });

  it('calls getSalesReport with tenantId and date range (18.9)', async () => {
    const { GET } = await import('@/app/api/reports/sales/route');
    await GET(req('GET', '/api/reports/sales?startDate=2026-01-01&endDate=2026-01-31&period=monthly'));
    expect(vi.mocked(getSalesReport)).toHaveBeenCalledWith(
      TENANT_ID,
      'monthly',
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/sales/route');
    const res = await GET(req('GET', '/api/reports/sales'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/sales/route');
    const res = await GET(req('GET', '/api/reports/sales'));
    expect(res.status).toBe(404);
  });
});

// ── 18.2  GET /api/reports/products ───────────────────────────────────────
describe('GET /api/reports/products (18.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(getProductPerformance).mockResolvedValue([
      { productId: 'p1', name: 'Coffee', totalSold: 120, revenue: 6000 },
      { productId: 'p2', name: 'Tea', totalSold: 80, revenue: 3200 },
    ] as any);
  });

  it('returns product sales ranking', async () => {
    const { GET } = await import('@/app/api/reports/products/route');
    const res = await GET(req('GET', '/api/reports/products?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Coffee');
    expect(body.data[0].totalSold).toBe(120);
  });

  it('calls getProductPerformance with tenantId and date range (18.9)', async () => {
    const { GET } = await import('@/app/api/reports/products/route');
    await GET(req('GET', '/api/reports/products?startDate=2026-01-01&endDate=2026-01-31&limit=5'));
    expect(vi.mocked(getProductPerformance)).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Date),
      expect.any(Date),
      5
    );
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/products/route');
    const res = await GET(req('GET', '/api/reports/products'));
    expect(res.status).toBe(404);
  });
});

// ── 18.3  GET /api/reports/cash-drawer ────────────────────────────────────
describe('GET /api/reports/cash-drawer (18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(getCashDrawerReports).mockResolvedValue([
      { sessionId: 'session1', openingAmount: 500, closingAmount: 700, expectedAmount: 750, shortage: 50 },
    ] as any);
  });

  it('returns cash drawer reconciliation report', async () => {
    const { GET } = await import('@/app/api/reports/cash-drawer/route');
    const res = await GET(req('GET', '/api/reports/cash-drawer?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].shortage).toBe(50);
    expect(body.data[0].expectedAmount).toBe(750);
  });

  it('calls getCashDrawerReports with tenantId and dates (18.9)', async () => {
    const { GET } = await import('@/app/api/reports/cash-drawer/route');
    await GET(req('GET', '/api/reports/cash-drawer?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(getCashDrawerReports)).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/cash-drawer/route');
    const res = await GET(req('GET', '/api/reports/cash-drawer'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/cash-drawer/route');
    const res = await GET(req('GET', '/api/reports/cash-drawer'));
    expect(res.status).toBe(404);
  });
});

// ── 18.5  GET /api/reports/sales-journal ──────────────────────────────────
describe('GET /api/reports/sales-journal (18.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Transaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockTransaction]),
      }),
    } as any);
  });

  it('returns journal entries with summary', async () => {
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    const res = await GET(req('GET', '/api/reports/sales-journal?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].receiptNumber).toBe('REC001');
    expect(body.data.summary.totalTransactions).toBe(1);
  });

  it('filters by tenantId in query (18.8)', async () => {
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    await GET(req('GET', '/api/reports/sales-journal?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('filters by date range (18.9)', async () => {
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    await GET(req('GET', '/api/reports/sales-journal?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: expect.objectContaining({ $gte: expect.any(Date) }) })
    );
  });

  it('returns CSV when format=csv', async () => {
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    const res = await GET(req('GET', '/api/reports/sales-journal?format=csv'));
    expect(res.headers.get('Content-Type')).toContain('text/csv');
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    const res = await GET(req('GET', '/api/reports/sales-journal'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/sales-journal/route');
    const res = await GET(req('GET', '/api/reports/sales-journal'));
    expect(res.status).toBe(404);
  });
});

// ── 18.6  GET /api/reports/cas ────────────────────────────────────────────
describe('GET /api/reports/cas (18.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkBirFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Transaction.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([mockTransaction]),
      }),
    } as any);
  });

  it('returns CAS report as CSV', async () => {
    const { GET } = await import('@/app/api/reports/cas/route');
    const res = await GET(req('GET', '/api/reports/cas?startDate=2026-01-01&endDate=2026-01-31'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('cas-report');
  });

  it('filters by tenantId and completed status (18.8)', async () => {
    const { GET } = await import('@/app/api/reports/cas/route');
    await GET(req('GET', '/api/reports/cas?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, status: 'completed' })
    );
  });

  it('returns 403 when BIR feature not enabled', async () => {
    vi.mocked(checkBirFeatureAccess).mockRejectedValue(new Error('BIR feature not enabled'));
    const { GET } = await import('@/app/api/reports/cas/route');
    const res = await GET(req('GET', '/api/reports/cas'));
    expect(res.status).toBe(403);
  });

  it('returns 400 on invalid date format', async () => {
    const { GET } = await import('@/app/api/reports/cas/route');
    const res = await GET(req('GET', '/api/reports/cas?startDate=not-a-date'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/cas/route');
    const res = await GET(req('GET', '/api/reports/cas'));
    expect(res.status).toBe(404);
  });
});

// ── 18.7  GET /api/reports/vat ────────────────────────────────────────────
describe('GET /api/reports/vat (18.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Tenant.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockTenant),
    } as any);
    vi.mocked(getVATReport).mockResolvedValue({
      vatableSales: 10000,
      vatAmount: 1200,
      vatExemptSales: 500,
      zeroRatedSales: 200,
      byPeriod: [{ period: '2026-01', vatAmount: 1200 }],
    } as any);
  });

  it('returns VAT report grouped by period', async () => {
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.vatAmount).toBe(1200);
    expect(body.data.byPeriod).toHaveLength(1);
  });

  it('calls getVATReport with tenantId and dates (18.9)', async () => {
    const { GET } = await import('@/app/api/reports/vat/route');
    await GET(req('GET', '/api/reports/vat?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(getVATReport)).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Date),
      expect.any(Date),
      mockTenant.settings
    );
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when tenantId missing (18.8)', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/vat/route');
    const res = await GET(req('GET', '/api/reports/vat'));
    expect(res.status).toBe(404);
  });
});
