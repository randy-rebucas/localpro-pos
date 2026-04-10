/**
 * Tests for automation routes with non-standard patterns:
 *   - status route (direct multi-model queries)
 *   - subscriptions/expire (inline logic with Subscription.updateMany)
 *   - triggers/evaluate (Bearer token auth + evaluateTriggers)
 *   - customers/engagement-score (Bearer token auth + calculateEngagementScores)
 *   - inventory/expiry-alerts (Bearer token auth + checkExpiryAlerts)
 *   - webhooks/retry (Bearer token auth + retryPendingDeliveries)
 */
import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockVerifyCronAuth = vi.hoisted(() => vi.fn().mockReturnValue(null));
const mockHandleApiError = vi.hoisted(() =>
  vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false }), { status: 500, headers: { 'content-type': 'application/json' } })
  )
);

// Status route — model mocks
const mockDiscountCountDocuments = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockAttendanceCountDocuments = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockCashDrawerCountDocuments = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const mockTransactionFind = vi.hoisted(() => vi.fn());

// Subscriptions/expire — model mock
const mockSubscriptionUpdateMany = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ modifiedCount: 0 })
);

// Trigger engine
const mockEvaluateTriggers = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ customersReached: 2 }])
);

// Tenant model (used by triggers/evaluate and engagement-score)
const mockTenantFind = vi.hoisted(() => vi.fn());

// Engagement score
const mockCalculateEngagementScores = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ updated: 5 })
);

// Expiry alerts
const mockCheckExpiryAlerts = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ checked: 10, alerted: 2 })
);

// Webhook retry
const mockRetryPendingDeliveries = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ retried: 3, succeeded: 2, failed: 1 })
);

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/automation-auth', () => ({ verifyCronAuth: mockVerifyCronAuth }));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/automation-validation', () => ({
  positiveInt: vi.fn((v: any, def: number) => (v != null && !isNaN(Number(v)) ? Number(v) : def)),
  validTenantId: vi.fn((v: any) => v || undefined),
}));

vi.mock('@/models/Discount', () => ({
  default: { countDocuments: mockDiscountCountDocuments },
}));
vi.mock('@/models/Attendance', () => ({
  default: { countDocuments: mockAttendanceCountDocuments },
}));
vi.mock('@/models/CashDrawerSession', () => ({
  default: { countDocuments: mockCashDrawerCountDocuments },
}));
vi.mock('@/models/Transaction', () => ({
  default: { find: mockTransactionFind },
}));
vi.mock('@/models/Subscription', () => ({
  default: { updateMany: mockSubscriptionUpdateMany },
}));
vi.mock('@/models/Tenant', () => ({
  default: { find: mockTenantFind },
}));
vi.mock('@/lib/automations/trigger-engine', () => ({
  evaluateTriggers: mockEvaluateTriggers,
}));
vi.mock('@/lib/automations/engagement-score', () => ({
  calculateEngagementScores: mockCalculateEngagementScores,
}));
vi.mock('@/lib/automations/expiry-alerts', () => ({
  checkExpiryAlerts: mockCheckExpiryAlerts,
}));
vi.mock('@/lib/webhooks', () => ({
  retryPendingDeliveries: mockRetryPendingDeliveries,
  validateWebhookUrl: vi.fn().mockReturnValue(null),
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeGet(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method: 'GET', headers });
}

function makePost(url: string, headers: Record<string, string> = {}, body?: Record<string, any>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const CRON_SECRET = 'test-cron-secret';

// ── Status Route ──────────────────────────────────────────────────────────────
describe('GET /api/automations/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockDiscountCountDocuments.mockResolvedValue(0);
    mockAttendanceCountDocuments.mockResolvedValue(0);
    mockCashDrawerCountDocuments.mockResolvedValue(0);
    mockTransactionFind.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([]) }) });
  });

  it('returns 200 with stats object', async () => {
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('discounts');
    expect(json.data).toHaveProperty('attendance');
    expect(json.data).toHaveProperty('cashDrawer');
    expect(json.data).toHaveProperty('transactions');
  });

  it('returns 401 when auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    expect(res.status).toBe(401);
  });

  it('queries discount counts', async () => {
    mockDiscountCountDocuments.mockResolvedValue(3);
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    const json = await res.json();
    expect(json.data.discounts.active).toBe(3);
    expect(mockDiscountCountDocuments).toHaveBeenCalledTimes(4); // active, expiringSoon, needsActivation, needsDeactivation
  });

  it('queries attendance open sessions', async () => {
    mockAttendanceCountDocuments.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    const json = await res.json();
    expect(json.data.attendance.openSessions).toBe(5);
    expect(json.data.attendance.forgottenSessions).toBe(2);
  });

  it('queries cash drawer open sessions', async () => {
    mockCashDrawerCountDocuments.mockResolvedValue(1);
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    const json = await res.json();
    expect(json.data.cashDrawer.openSessions).toBe(1);
  });

  it('counts pending receipts from email-matched transactions', async () => {
    const txWithEmail = { notes: 'email: customer@example.com' };
    const txNoNotes = { notes: undefined };
    const txCashOnly = { notes: 'cash payment, no contact info' };
    mockTransactionFind.mockReturnValue({
      limit: () => ({ lean: () => Promise.resolve([txWithEmail, txNoNotes, txCashOnly]) }),
    });
    const { GET } = await import('@/app/api/automations/status/route');
    const res = await GET(makeGet('http://localhost/api/automations/status'));
    const json = await res.json();
    expect(json.data.transactions.pendingReceipts).toBe(1);
  });
});

// ── Subscriptions / Expire ────────────────────────────────────────────────────
describe('subscriptions/expire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(null);
    mockSubscriptionUpdateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it('POST 200 — returns success with processed counts', async () => {
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await POST(makePost('http://localhost'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toHaveProperty('success');
    expect(json).toHaveProperty('processed');
    expect(json).toHaveProperty('details');
  });

  it('POST 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('POST calls updateMany three times (trials, expired, suspended)', async () => {
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    await POST(makePost('http://localhost'));
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledTimes(3);
  });

  it('POST reports modifiedCounts correctly', async () => {
    mockSubscriptionUpdateMany
      .mockResolvedValueOnce({ modifiedCount: 2 }) // trials expired
      .mockResolvedValueOnce({ modifiedCount: 3 }) // subscriptions expired
      .mockResolvedValueOnce({ modifiedCount: 1 }); // suspended
    const { POST } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await POST(makePost('http://localhost'));
    const json = await res.json();
    expect(json.processed).toBe(6);
    expect(json.details.trialsExpired).toBe(2);
    expect(json.details.subscriptionsExpired).toBe(3);
    expect(json.details.subscriptionsSuspended).toBe(1);
  });

  it('GET 200 — processes subscriptions', async () => {
    const { GET } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledTimes(3);
  });

  it('GET 401 — auth denied', async () => {
    mockVerifyCronAuth.mockReturnValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('@/app/api/automations/subscriptions/expire/route');
    const res = await GET(makeGet('http://localhost'));
    expect(res.status).toBe(401);
  });
});

// ── Triggers / Evaluate (Bearer token) ───────────────────────────────────────
describe('POST /api/automations/triggers/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    mockTenantFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([{ _id: { toString: () => 'tenant-1' } }]) }),
    });
  });

  it('returns 200 and evaluates triggers for all tenants', async () => {
    const { POST } = await import('@/app/api/automations/triggers/evaluate/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.tenantsProcessed).toBeGreaterThanOrEqual(1);
    expect(mockEvaluateTriggers).toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET missing from env', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/automations/triggers/evaluate/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header is wrong', async () => {
    const { POST } = await import('@/app/api/automations/triggers/evaluate/route');
    const res = await POST(makePost('http://localhost', { authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('evaluates only target tenant when tenantId query param provided', async () => {
    const { POST } = await import('@/app/api/automations/triggers/evaluate/route');
    const res = await POST(
      makePost('http://localhost?tenantId=specific-tenant', { authorization: `Bearer ${CRON_SECRET}` })
    );
    const json = await res.json();
    expect(json.data.tenantsProcessed).toBe(1);
    expect(mockEvaluateTriggers).toHaveBeenCalledWith('specific-tenant');
    expect(mockTenantFind).not.toHaveBeenCalled();
  });

  it('sums totalFired across all tenants', async () => {
    mockTenantFind.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([
          { _id: { toString: () => 'tenant-1' } },
          { _id: { toString: () => 'tenant-2' } },
        ]),
      }),
    });
    mockEvaluateTriggers.mockResolvedValue([{ customersReached: 4 }]);
    const { POST } = await import('@/app/api/automations/triggers/evaluate/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(json.data.totalFired).toBe(8); // 4 per tenant × 2 tenants
  });
});

// ── Customers / Engagement Score (Bearer token) ───────────────────────────────
describe('POST /api/automations/customers/engagement-score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    mockTenantFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([{ _id: { toString: () => 'tenant-1' } }]) }),
    });
  });

  it('returns 200 with totalUpdated', async () => {
    const { POST } = await import('@/app/api/automations/customers/engagement-score/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockCalculateEngagementScores).toHaveBeenCalledWith('tenant-1');
  });

  it('returns 401 when CRON_SECRET missing', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/automations/customers/engagement-score/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header wrong', async () => {
    const { POST } = await import('@/app/api/automations/customers/engagement-score/route');
    const res = await POST(makePost('http://localhost', { authorization: 'Bearer bad-secret' }));
    expect(res.status).toBe(401);
  });

  it('processes only target tenant when tenantId provided', async () => {
    const { POST } = await import('@/app/api/automations/customers/engagement-score/route');
    const res = await POST(
      makePost('http://localhost?tenantId=t-123', { authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(res.status).toBe(200);
    expect(mockCalculateEngagementScores).toHaveBeenCalledWith('t-123');
    expect(mockTenantFind).not.toHaveBeenCalled();
  });
});

// ── Inventory / Expiry Alerts (Bearer token) ──────────────────────────────────
describe('POST /api/automations/inventory/expiry-alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it('returns 200 with expiry alert result', async () => {
    const { POST } = await import('@/app/api/automations/inventory/expiry-alerts/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ checked: 10, alerted: 2 });
    expect(mockCheckExpiryAlerts).toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET missing', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/automations/inventory/expiry-alerts/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header wrong', async () => {
    const { POST } = await import('@/app/api/automations/inventory/expiry-alerts/route');
    const res = await POST(makePost('http://localhost', { authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });
});

// ── Webhooks / Retry (Bearer token) ──────────────────────────────────────────
describe('POST /api/automations/webhooks/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it('returns 200 with retry result', async () => {
    const { POST } = await import('@/app/api/automations/webhooks/retry/route');
    const res = await POST(makePost('http://localhost', { authorization: `Bearer ${CRON_SECRET}` }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ retried: 3, succeeded: 2, failed: 1 });
    expect(mockRetryPendingDeliveries).toHaveBeenCalled();
  });

  it('returns 401 when CRON_SECRET missing', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/automations/webhooks/retry/route');
    const res = await POST(makePost('http://localhost'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when Authorization header wrong', async () => {
    const { POST } = await import('@/app/api/automations/webhooks/retry/route');
    const res = await POST(makePost('http://localhost', { authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
  });
});
