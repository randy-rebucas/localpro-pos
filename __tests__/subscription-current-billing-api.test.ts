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

  it('returns 500 with a translated error when the tenant lookup throws', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Unauthorized: Authentication required'));

    const res = await getCurrent(createRequest('/api/subscriptions/current'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(500);
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
    expect(body.data).toEqual([
      { _id: 'b1', amount: 500, currency: 'PHP', status: 'paid', date: '2026-01-01T00:00:00.000Z', transactionId: undefined, invoiceUrl: undefined },
      { _id: 'b2', amount: 300, currency: 'USD', status: 'failed', date: '2026-02-01T00:00:00.000Z', transactionId: 'tx-2', invoiceUrl: undefined },
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
