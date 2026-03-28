/**
 * Section 12 — Cash Drawer
 * Tests: 12.1 – 12.5
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
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
}));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/models/CashDrawerSession', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: vi.fn() },
}));
vi.mock('@/models/Expense', () => ({
  default: { find: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import CashDrawerSession from '@/models/CashDrawerSession';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const SESSION_ID = 'session1';

const mockOpenSession = {
  _id: SESSION_ID,
  tenantId: TENANT_ID,
  userId: 'user1',
  openingAmount: 500,
  openingTime: new Date('2026-01-01T08:00:00Z'),
  status: 'open',
  save: vi.fn().mockResolvedValue(undefined),
};

const mockClosedSession = {
  _id: SESSION_ID,
  tenantId: TENANT_ID,
  userId: 'user1',
  openingAmount: 500,
  closingAmount: 700,
  expectedAmount: 750,
  shortage: 50,
  overage: undefined,
  openingTime: new Date('2026-01-01T08:00:00Z'),
  closingTime: new Date('2026-01-01T18:00:00Z'),
  status: 'closed',
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 12.2  GET /api/cash-drawer/sessions ───────────────────────────────────
describe('GET /api/cash-drawer/sessions (12.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(CashDrawerSession.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockClosedSession]),
        }),
      }),
    } as any);
  });

  it('returns sessions for tenant', async () => {
    const { GET } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await GET(req('GET', '/api/cash-drawer/sessions'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('filters by status query param', async () => {
    const { GET } = await import('@/app/api/cash-drawer/sessions/route');
    await GET(req('GET', '/api/cash-drawer/sessions?status=closed'));
    expect(vi.mocked(CashDrawerSession.find)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'closed' })
    );
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await GET(req('GET', '/api/cash-drawer/sessions'));
    expect(res.status).toBe(500);
  });

  it('returns 404 when tenantId missing', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await GET(req('GET', '/api/cash-drawer/sessions'));
    expect(res.status).toBe(404);
  });
});

// ── 12.1  POST /api/cash-drawer/sessions — open ───────────────────────────
describe('POST /api/cash-drawer/sessions — open (12.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    // No existing open session
    vi.mocked(CashDrawerSession.findOne).mockResolvedValue(null as any);
    vi.mocked(CashDrawerSession.create).mockResolvedValue({
      _id: SESSION_ID,
      tenantId: TENANT_ID,
      userId: 'user1',
      openingAmount: 500,
      status: 'open',
      toString: () => SESSION_ID,
    } as any);
  });

  it('opens session with opening balance and returns 201', async () => {
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 500,
    }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.openingAmount).toBe(500);
    expect(body.data.status).toBe('open');
  });

  it('returns 400 when a session is already open', async () => {
    vi.mocked(CashDrawerSession.findOne).mockResolvedValue(mockOpenSession as any);
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 500,
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when action is invalid', async () => {
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await POST(req('POST', '/api/cash-drawer/sessions', { action: 'unknown' }));
    expect(res.status).toBe(400);
  });
});

// ── 12.3 & 12.4  POST /api/cash-drawer/sessions — close ──────────────────
describe('POST /api/cash-drawer/sessions — close (12.3 & 12.4)', () => {
  // opening=500, cashSales=300, cashExpenses=50 → expected=750
  // closing=700 → difference=-50 → shortage=50
  const sessionDoc = { ...mockOpenSession, save: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(CashDrawerSession.findOne).mockResolvedValue(sessionDoc as any);
    vi.mocked(Transaction.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { total: 200 },
        { total: 100 },
      ]),
    } as any);
    vi.mocked(Expense.find).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { amount: 50 },
      ]),
    } as any);
  });

  it('queries cash transactions for the session period (12.3)', async () => {
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 700,
    }));
    expect(vi.mocked(Transaction.find)).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        paymentMethod: 'cash',
        status: 'completed',
      })
    );
  });

  it('computes expected amount and shortage correctly (12.4)', async () => {
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 700,
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // expectedAmount = 500 + 300 - 50 = 750
    expect(sessionDoc.expectedAmount).toBe(750);
    // shortage = 750 - 700 = 50
    expect(sessionDoc.shortage).toBe(50);
    expect(sessionDoc.overage).toBeUndefined();
    expect(sessionDoc.save).toHaveBeenCalled();
  });

  it('records overage when actual exceeds expected', async () => {
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 800,
    }));
    // expectedAmount=750, closingAmount=800 → overage=50
    expect(sessionDoc.overage).toBe(50);
    expect(sessionDoc.shortage).toBeUndefined();
  });

  it('returns 404 when no open session exists', async () => {
    vi.mocked(CashDrawerSession.findOne).mockResolvedValue(null as any);
    const { POST } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await POST(req('POST', '/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 700,
    }));
    expect(res.status).toBe(404);
  });
});

// ── 12.5  Cash drawer report reflects correct daily totals ─────────────────
describe('Cash drawer report — daily totals (12.5)', () => {
  const closedSessions = [
    { ...mockClosedSession, openingAmount: 500, closingAmount: 700, expectedAmount: 750, shortage: 50 },
    { ...mockClosedSession, _id: 'session2', openingAmount: 300, closingAmount: 320, expectedAmount: 310, overage: 10 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(CashDrawerSession.find).mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(closedSessions),
        }),
      }),
    } as any);
  });

  it('returns multiple closed sessions with reconciliation totals', async () => {
    const { GET } = await import('@/app/api/cash-drawer/sessions/route');
    const res = await GET(req('GET', '/api/cash-drawer/sessions?status=closed'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].expectedAmount).toBe(750);
    expect(body.data[0].shortage).toBe(50);
    expect(body.data[1].overage).toBe(10);
  });
});
