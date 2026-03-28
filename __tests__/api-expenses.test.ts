/**
 * Section 13 — Expenses
 * Tests: 13.1 – 13.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
  requireTenantAccess: vi.fn().mockResolvedValue({ tenantId: 'tenant123', user: { userId: 'user1', role: 'admin' } }),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockReturnValue(
    NextResponse.json({ success: false, error: 'Error' }, { status: 500 })
  ),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/analytics', () => ({
  getProfitLossSummary: vi.fn().mockResolvedValue({
    revenue: { total: 5000 },
    expenses: { total: 800, byCategory: [{ category: 'Rent', amount: 500 }, { category: 'Supplies', amount: 300 }] },
    grossProfit: 4200,
    netProfit: 3400,
  }),
}));
vi.mock('@/models/Expense', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import { checkFeatureAccess } from '@/lib/subscription';
import { getProfitLossSummary } from '@/lib/analytics';
import Expense from '@/models/Expense';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const EXPENSE_ID = 'exp1';

const mockExpenseDoc = {
  _id: EXPENSE_ID,
  tenantId: TENANT_ID,
  name: 'Office Rent',
  description: 'Monthly office rent',
  amount: 500,
  date: new Date('2026-01-01'),
  paymentMethod: 'cash',
  isActive: true,
};

const makeExpenseDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockExpenseDoc,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
  toObject: vi.fn().mockReturnValue({ ...mockExpenseDoc, ...overrides }),
  _id: { toString: () => EXPENSE_ID },
});

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 13.1  GET /api/expenses ────────────────────────────────────────────────
describe('GET /api/expenses (13.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: { userId: 'user1', role: 'admin' } } as any);
    vi.mocked(Expense.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockExpenseDoc]),
        }),
      }),
    } as any);
  });

  it('returns list of expenses', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    const res = await GET(req('GET', '/api/expenses'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Office Rent');
  });

  it('filters by date range', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    await GET(req('GET', '/api/expenses?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(Expense.find)).toHaveBeenCalledWith(
      expect.objectContaining({ date: expect.objectContaining({ $gte: expect.any(Date) }) })
    );
  });

  it('filters by name', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    await GET(req('GET', '/api/expenses?name=Rent'));
    expect(vi.mocked(Expense.find)).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Rent' })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const { GET } = await import('@/app/api/expenses/route');
    const res = await GET(req('GET', '/api/expenses'));
    expect(res.status).toBe(401);
  });
});

// ── 13.1  POST /api/expenses ───────────────────────────────────────────────
describe('POST /api/expenses (13.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: { userId: 'user1', role: 'admin' } } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Expense.create).mockResolvedValue({
      ...mockExpenseDoc,
      _id: { toString: () => EXPENSE_ID },
    } as any);
  });

  it('creates expense and returns 201', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      name: 'Office Rent',
      description: 'Monthly office rent',
      amount: 500,
      paymentMethod: 'cash',
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.amount).toBe(500);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      description: 'Some expense',
      amount: 100,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      name: 'Office Rent',
      amount: 100,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      name: 'Office Rent',
      description: 'Monthly office rent',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is negative', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      name: 'Office Rent',
      description: 'Monthly rent',
      amount: -50,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false } as any);
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(req('POST', '/api/expenses', {
      name: 'Office Rent',
      description: 'Monthly rent',
      amount: 500,
    }));
    expect(res.status).toBe(429);
  });
});

// ── 13.2  PUT /api/expenses/[id] ──────────────────────────────────────────
describe('PUT /api/expenses/[id] (13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: { userId: 'user1', role: 'admin' } } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Expense.findOne).mockResolvedValue(makeExpenseDoc() as any);
  });

  it('updates expense and returns 200', async () => {
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      req('PUT', `/api/expenses/${EXPENSE_ID}`, { name: 'Updated Rent', amount: 600 }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when expense not found', async () => {
    vi.mocked(Expense.findOne).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      req('PUT', `/api/expenses/bad-id`, { name: 'Updated' }),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 13.2  DELETE /api/expenses/[id] ───────────────────────────────────────
describe('DELETE /api/expenses/[id] (13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({ tenantId: TENANT_ID, user: { userId: 'user1', role: 'admin' } } as any);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true } as any);
    vi.mocked(Expense.findOneAndUpdate).mockResolvedValue(
      makeExpenseDoc({ isActive: false }) as any
    );
  });

  it('soft-deletes expense and returns 200', async () => {
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/expenses/${EXPENSE_ID}`),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(Expense.findOneAndUpdate)).toHaveBeenCalledWith(
      expect.objectContaining({ _id: EXPENSE_ID, isActive: true }),
      { isActive: false },
      { new: true }
    );
  });

  it('returns 404 when expense not found', async () => {
    vi.mocked(Expense.findOneAndUpdate).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/expenses/bad-id`),
      { params: Promise.resolve({ id: 'bad-id' }) }
    );
    expect(res.status).toBe(404);
  });
});

// ── 13.3  Expenses appear in P&L report ───────────────────────────────────
describe('GET /api/reports/profit-loss — expenses in P&L (13.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(getProfitLossSummary).mockResolvedValue({
      revenue: { total: 5000 },
      expenses: { total: 800, byCategory: [{ category: 'Rent', amount: 500 }, { category: 'Supplies', amount: 300 }] },
      grossProfit: 4200,
      netProfit: 3400,
    } as any);
  });

  it('returns P&L summary including expenses', async () => {
    const { GET } = await import('@/app/api/reports/profit-loss/route');
    const res = await GET(req('GET', '/api/reports/profit-loss?startDate=2026-01-01&endDate=2026-01-31'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.expenses.total).toBe(800);
    expect(body.data.expenses.byCategory).toHaveLength(2);
    expect(body.data.netProfit).toBe(3400);
  });

  it('calls getProfitLossSummary with tenantId and date range', async () => {
    const { GET } = await import('@/app/api/reports/profit-loss/route');
    await GET(req('GET', '/api/reports/profit-loss?startDate=2026-01-01&endDate=2026-01-31'));
    expect(vi.mocked(getProfitLossSummary)).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Date),
      expect.any(Date)
    );
  });

  it('returns 403 when reports feature not enabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { GET } = await import('@/app/api/reports/profit-loss/route');
    const res = await GET(req('GET', '/api/reports/profit-loss'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/reports/profit-loss/route');
    const res = await GET(req('GET', '/api/reports/profit-loss'));
    expect(res.status).toBe(404);
  });
});
