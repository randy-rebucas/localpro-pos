/**
 * Cash drawer management – detailed coverage for the close-session
 * financial calculations (expected amount, shortage, overage),
 * manager fallback, duplicate-key race condition, GET filtering, and pagination.
 *
 * Basic open/close happy-paths are already in bookings-id-cashdrawer-api.test.ts.
 */

process.env.JWT_SECRET = 'test-secret-32chars-cashmgmt12!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockCashDrawerFind,
  mockCashDrawerFindOne,
  mockCashDrawerCreate,
  mockCashDrawerCount,
  mockTransactionFind,
  mockExpenseFind,
  mockRequireAuth,
  mockRequireRole,
  mockGetTenantId,
  mockCreateAuditLog,
} = vi.hoisted(() => ({
  mockCashDrawerFind: vi.fn(),
  mockCashDrawerFindOne: vi.fn(),
  mockCashDrawerCreate: vi.fn(),
  mockCashDrawerCount: vi.fn(),
  mockTransactionFind: vi.fn(),
  mockExpenseFind: vi.fn(),
  mockRequireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'cashier' }),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockGetTenantId: vi.fn().mockResolvedValue('tenant-1'),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE' },
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
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mockGetTenantId,
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: mockRequireAuth, requireRole: mockRequireRole };
});
vi.mock('@/models/CashDrawerSession', () => ({
  default: {
    find: mockCashDrawerFind,
    findOne: mockCashDrawerFindOne,
    create: mockCashDrawerCreate,
    countDocuments: mockCashDrawerCount,
  },
}));
vi.mock('@/models/Transaction', () => ({ default: { find: mockTransactionFind } }));
vi.mock('@/models/Expense', () => ({ default: { find: mockExpenseFind } }));

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

const OPENING_TIME = new Date('2024-06-01T09:00:00Z');

/** Factory for a mutable open session object */
function makeOpenSession(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'sess-1',
    tenantId: 'tenant-1',
    userId: { toString: () => 'user-1' },
    status: 'open',
    openingAmount: 100,
    openingTime: OPENING_TIME,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Cash transaction shorthand */
function makeCashTx(total: number, taxAmount = 0, discountAmount = 0) {
  return { total, taxAmount, discountAmount };
}

/** Expense shorthand */
function makeExpense(amount: number) {
  return { amount };
}

// ===========================================================================
// POST /api/cash-drawer/sessions — close: financial calculations
// ===========================================================================

describe('POST /api/cash-drawer/sessions (close) — financial calculations', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'cashier' });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockRequireRole.mockResolvedValue(undefined);
    // Default: user has their own open session
    mockCashDrawerFindOne.mockResolvedValue(makeOpenSession());
    // Default: no transactions, no expenses
    mockTransactionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockExpenseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    ({ POST } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  it('calculates expected = opening + cash sales when no expenses', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(50), makeCashTx(30)]),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 180,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // expected = 100 (opening) + 80 (sales) = 180
    expect(body.data.expectedAmount).toBe(180);
    expect(body.data.shortage).toBe(0);
    expect(body.data.overage).toBe(0);
  });

  it('calculates expected = opening + sales - expenses', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(200)]),
    });
    mockExpenseFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeExpense(40)]),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 260,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // expected = 100 + 200 - 40 = 260
    expect(body.data.expectedAmount).toBe(260);
    expect(body.data.shortage).toBe(0);
    expect(body.data.overage).toBe(0);
  });

  it('detects a shortage when closing amount is less than expected', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(100)]),
    });
    // closing = 180, expected = 100 + 100 = 200  →  shortage = 20
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 180,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.expectedAmount).toBe(200);
    expect(body.data.shortage).toBe(20);
    expect(body.data.overage).toBe(0);
  });

  it('detects an overage when closing amount exceeds expected', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(100)]),
    });
    // closing = 210, expected = 200  →  overage = 10
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 210,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.expectedAmount).toBe(200);
    expect(body.data.shortage).toBe(0);
    expect(body.data.overage).toBe(10);
  });

  it('accumulates VAT and discounts on the session', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        makeCashTx(100, 12, 5),  // total=100, tax=12, discount=5
        makeCashTx(50, 6, 0),
      ]),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 250,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalVAT).toBe(18);
    expect(body.data.totalDiscounts).toBe(5);
  });

  it('handles floating-point amounts without rounding errors', async () => {
    // Classic 0.1 + 0.2 scenario
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(0.1), makeCashTx(0.2)]),
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 100.3, // 100 opening + 0.1 + 0.2
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.expectedAmount).toBe(100.3);
    expect(body.data.shortage).toBe(0);
    expect(body.data.overage).toBe(0);
  });

  it('sets status to closed and records closingTime on the session', async () => {
    const session = makeOpenSession();
    mockCashDrawerFindOne.mockResolvedValue(session);
    await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 100,
    }));
    expect(session.status).toBe('closed');
    expect(session.closingTime).toBeInstanceOf(Date);
    expect(session.save).toHaveBeenCalled();
  });

  it('persists notes on close when provided', async () => {
    const session = makeOpenSession();
    mockCashDrawerFindOne.mockResolvedValue(session);
    await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 100,
      notes: 'End of shift',
    }));
    expect(session.notes).toBe('End of shift');
  });

  it('records transactionCount in audit log', async () => {
    mockTransactionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([makeCashTx(50), makeCashTx(50), makeCashTx(50)]),
    });
    await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 250,
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: expect.objectContaining({ transactionCount: 3 }),
      })
    );
  });
});

// ===========================================================================
// POST — close: manager fallback
// ===========================================================================

describe('POST /api/cash-drawer/sessions (close) — manager fallback', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'manager-1', tenantId: 'tenant-1', role: 'manager' });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockRequireRole.mockResolvedValue(undefined);
    mockTransactionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockExpenseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    ({ POST } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  it('allows a manager to close another cashier\'s open session', async () => {
    const cashierSession = makeOpenSession({ userId: { toString: () => 'cashier-1' } });
    mockCashDrawerFindOne
      .mockResolvedValueOnce(null)         // manager's own session → not found
      .mockResolvedValueOnce(cashierSession); // any open session → found
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 100,
    }));
    expect(res.status).toBe(200);
    // requireRole was called to enforce manager/admin/owner check
    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['manager'])
    );
  });

  it('returns 404 when no open session exists at all', async () => {
    mockCashDrawerFindOne
      .mockResolvedValueOnce(null) // user's session
      .mockResolvedValueOnce(null); // any session
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'close',
      closingAmount: 100,
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no open cash drawer/i);
  });
});

// ===========================================================================
// POST — open: race condition (11000 duplicate key)
// ===========================================================================

describe('POST /api/cash-drawer/sessions (open) — race condition', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'cashier' });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockCashDrawerFindOne.mockResolvedValue(null); // check passes
    ({ POST } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  it('returns 400 on duplicate-key error (concurrent open race)', async () => {
    const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    mockCashDrawerCreate.mockRejectedValue(dupErr);
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 100,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already an open cash drawer/i);
  });

  it('re-throws non-11000 errors as 500', async () => {
    mockCashDrawerCreate.mockRejectedValue(new Error('Connection lost'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/cash-drawer/sessions', {
      action: 'open',
      openingAmount: 100,
    }));
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// GET /api/cash-drawer/sessions — filtering and pagination
// ===========================================================================

describe('GET /api/cash-drawer/sessions — filtering and pagination', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockSessions = [
    { _id: 's-1', status: 'open', tenantId: 'tenant-1' },
    { _id: 's-2', status: 'closed', tenantId: 'tenant-1' },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user-1', tenantId: 'tenant-1', role: 'admin' });
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockCashDrawerFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockSessions),
    });
    mockCashDrawerCount.mockResolvedValue(2);
    ({ GET } = await import('@/app/api/cash-drawer/sessions/route'));
  });

  it('applies status filter when provided', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions?status=open'));
    expect(mockCashDrawerFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open' })
    );
  });

  it('does not filter by status when param is absent', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions'));
    const callArg = mockCashDrawerFind.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('status');
  });

  it('returns correct totalPages in pagination', async () => {
    mockCashDrawerCount.mockResolvedValue(10);
    mockCashDrawerFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions?limit=3'));
    const body = await res.json();
    expect(body.pagination.totalPages).toBe(4); // ceil(10/3)
    expect(body.pagination.total).toBe(10);
  });

  it('clamps limit to max 100', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions?limit=999'));
    // The route enforces Math.min(100, ...) so countDocuments is still called with tenantId query
    expect(mockCashDrawerFind).toHaveBeenCalled();
    // Verify limit is capped by checking call chain — the limit() mock receives ≤ 100
    const limitCall = mockCashDrawerFind.mock.results[0].value.limit;
    expect(limitCall).toHaveBeenCalledWith(100);
  });

  it('returns 200 with empty list when no sessions match', async () => {
    mockCashDrawerFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    });
    mockCashDrawerCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.totalPages).toBe(0);
  });

  it('returns 404 when tenant not found', async () => {
    mockGetTenantId.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/cash-drawer/sessions'));
    expect(res.status).toBe(404);
  });
});
