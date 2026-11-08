process.env.JWT_SECRET = 'test-secret-for-subscription-current-billing-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockSubscriptionFindOne = vi.fn();
vi.mock('@/models/Subscription', () => ({
  default: {
    findOne: (...args: unknown[]) => mockSubscriptionFindOne(...args),
  },
}));

vi.mock('@/models/SubscriptionPlan', () => ({}));

const mockUserCount = vi.fn();
const mockBranchCount = vi.fn();
const mockProductCount = vi.fn();
const mockMonthlyTx = vi.fn();
vi.mock('@/models/User', () => ({ default: { countDocuments: (...a: unknown[]) => mockUserCount(...a) } }));
vi.mock('@/models/Branch', () => ({ default: { countDocuments: (...a: unknown[]) => mockBranchCount(...a) } }));
vi.mock('@/models/Product', () => ({ default: { countDocuments: (...a: unknown[]) => mockProductCount(...a) } }));
vi.mock('@/lib/subscription', () => ({ SubscriptionService: { getMonthlyTransactionCount: (...a: unknown[]) => mockMonthlyTx(...a) } }));

import { GET as getCurrent } from '@/app/api/subscriptions/current/route';
import { GET as getBillingHistory } from '@/app/api/subscriptions/billing-history/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), { method: 'GET' });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockRequireTenantAccess.mockResolvedValue({
    tenantId,
    user: { userId, tenantId, email: 'test@example.com', role },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUserCount.mockResolvedValue(0);
  mockBranchCount.mockResolvedValue(0);
  mockProductCount.mockResolvedValue(0);
  mockMonthlyTx.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/current
// ---------------------------------------------------------------------------

describe('GET /api/subscriptions/current', () => {
  it('scopes the lookup to the authenticated tenant', async () => {
    authAs(TENANT_A);
    const populateMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'sub-1', tenantId: TENANT_A }) });
    mockSubscriptionFindOne.mockReturnValue({ populate: populateMock });

    const res = await getCurrent(createRequest('/api/subscriptions/current'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSubscriptionFindOne).toHaveBeenCalledWith({ tenantId: TENANT_A });
  });

  it('never leaks a different tenant\'s subscription', async () => {
    authAs(TENANT_B);
    const populateMock = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockSubscriptionFindOne.mockReturnValue({ populate: populateMock });

    await getCurrent(createRequest('/api/subscriptions/current'));

    expect(mockSubscriptionFindOne).not.toHaveBeenCalledWith({ tenantId: TENANT_A });
    expect(mockSubscriptionFindOne).toHaveBeenCalledWith({ tenantId: TENANT_B });
  });

  it('reports live usage counts scoped to the tenant instead of the stored counters', async () => {
    authAs(TENANT_A);
    const stored = { _id: 'sub-1', tenantId: TENANT_A, usage: { currentUsers: 9, currentBranches: 9, currentProducts: 9, currentTransactions: 9 } };
    mockSubscriptionFindOne.mockReturnValue({ populate: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(stored) }) });
    mockUserCount.mockResolvedValue(3);
    mockBranchCount.mockResolvedValue(1);
    mockProductCount.mockResolvedValue(42);
    mockMonthlyTx.mockResolvedValue(null);

    const { body } = await parseResponse(await getCurrent(createRequest('/api/subscriptions/current')));

    expect(body.data.usage).toMatchObject({ currentUsers: 3, currentBranches: 1, currentProducts: 42, currentTransactions: 0 });
    for (const count of [mockUserCount, mockBranchCount, mockProductCount]) {
      expect(count).toHaveBeenCalledWith({ tenantId: TENANT_A, isActive: true });
    }
    expect(mockMonthlyTx).toHaveBeenCalledWith(TENANT_A);
  });

  it('returns 401 when the request is not signed in', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized: Authentication required'));

    const res = await getCurrent(createRequest('/api/subscriptions/current'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(401);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/billing-history
// ---------------------------------------------------------------------------

describe('GET /api/subscriptions/billing-history', () => {
  it('scopes the lookup to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockSubscriptionFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await getBillingHistory(createRequest('/api/subscriptions/billing-history'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(mockSubscriptionFindOne).toHaveBeenCalledWith({ tenantId: TENANT_A });
  });

  it('formats billing entries with currency/status/date fallbacks', async () => {
    authAs(TENANT_A);
    mockSubscriptionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        billingHistory: [
          { _id: 'b1', amount: 500, createdAt: '2026-01-01T00:00:00.000Z' },
          { _id: 'b2', amount: 300, currency: 'USD', status: 'failed', date: '2026-02-01T00:00:00.000Z', transactionId: 'tx-2' },
        ],
      }),
    });

    const res = await getBillingHistory(createRequest('/api/subscriptions/billing-history'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    // Newest first
    expect(body.data).toEqual([
      { _id: 'b2', amount: 300, currency: 'USD', status: 'failed', date: '2026-02-01T00:00:00.000Z', transactionId: 'tx-2' },
      { _id: 'b1', amount: 500, currency: 'PHP', status: 'paid', date: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('returns an empty list when the tenant has no subscription', async () => {
    authAs(TENANT_A);
    mockSubscriptionFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await getBillingHistory(createRequest('/api/subscriptions/billing-history'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
