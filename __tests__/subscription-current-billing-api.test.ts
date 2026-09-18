process.env.JWT_SECRET = 'test-secret-for-subscription-current-billing-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubscriptionFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  default: {
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
    },
  },
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

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

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
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/current
// ---------------------------------------------------------------------------

describe('GET /api/subscriptions/current', () => {
  it('scopes the lookup to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockSubscriptionFindUnique.mockResolvedValue({ id: 'sub-1', tenantId: TENANT_A });

    const res = await getCurrent(createRequest('/api/subscriptions/current'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A } })
    );
  });

  it('never leaks a different tenant\'s subscription', async () => {
    authAs(TENANT_B);
    mockSubscriptionFindUnique.mockResolvedValue(null);

    await getCurrent(createRequest('/api/subscriptions/current'));

    expect(mockSubscriptionFindUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A } })
    );
    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_B } })
    );
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
    mockSubscriptionFindUnique.mockResolvedValue(null);

    const res = await getBillingHistory(createRequest('/api/subscriptions/billing-history'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(mockSubscriptionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT_A } })
    );
  });

  it('formats billing entries with currency/status/date fallbacks', async () => {
    authAs(TENANT_A);
    mockSubscriptionFindUnique.mockResolvedValue({
      billingHistory: [
        { id: 'b1', amount: 500, date: '2026-01-01T00:00:00.000Z' },
        { id: 'b2', amount: 300, currency: 'USD', status: 'failed', date: '2026-02-01T00:00:00.000Z', transactionId: 'tx-2' },
      ],
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
    mockSubscriptionFindUnique.mockResolvedValue(null);

    const res = await getBillingHistory(createRequest('/api/subscriptions/billing-history'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
