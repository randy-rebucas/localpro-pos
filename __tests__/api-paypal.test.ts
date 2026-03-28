/**
 * Section 6 (continued) — PayPal Integration
 * Tests: 6.6 – 6.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn().mockResolvedValue({ userId: 'user1', tenantId: 'tenant123', role: 'admin' }),
}));

vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
  getTenantSlugFromRequest: vi.fn().mockResolvedValue('demo'),
}));

vi.mock('@/lib/paypal', () => ({
  createSubscriptionPayment: vi.fn(),
  capturePayment: vi.fn(),
}));

vi.mock('@/models/SubscriptionPlan', () => ({
  default: { findOne: vi.fn() },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireAuth } from '@/lib/auth';
import { getTenantIdFromRequest, getTenantSlugFromRequest } from '@/lib/api-tenant';
import { createSubscriptionPayment, capturePayment } from '@/lib/paypal';
import SubscriptionPlan from '@/models/SubscriptionPlan';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const PLAN_ID = 'plan_abc';

const mockPlan = {
  _id: PLAN_ID,
  name: 'Pro',
  isActive: true,
  price: { monthly: 49, currency: 'USD' },
};

const mockPaypalOrder = { id: 'PAYPAL-ORDER-001', status: 'CREATED' };

const req = (method: string, url: string, body?: unknown, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

// ── 6.6  POST /api/paypal/create-payment ──────────────────────────────────
describe('POST /api/paypal/create-payment (6.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'user1', tenantId: TENANT_ID, role: 'admin' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getTenantSlugFromRequest).mockResolvedValue('demo');
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue(mockPlan as any);
    vi.mocked(createSubscriptionPayment).mockResolvedValue(mockPaypalOrder as any);
  });

  it('creates PayPal order and returns orderId', async () => {
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', { planId: PLAN_ID }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.orderId).toBe('PAYPAL-ORDER-001');
    expect(body.data.planId).toBe(PLAN_ID);
    expect(body.data.billingCycle).toBe('monthly');
    expect(vi.mocked(createSubscriptionPayment)).toHaveBeenCalledWith(
      PLAN_ID, mockPlan.price.monthly, 'USD', 'demo', 'en', 'monthly'
    );
  });

  it('applies 10% discount for yearly billing', async () => {
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(
      req('POST', '/api/paypal/create-payment', { planId: PLAN_ID, billingCycle: 'yearly' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // yearly = monthly * 12 * 0.9 = 49 * 12 * 0.9 = 529.2
    expect(body.data.amount).toBeCloseTo(529.2, 1);
    expect(body.data.billingCycle).toBe('yearly');
  });

  it('returns 400 when planId is missing', async () => {
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', {}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/plan id/i);
  });

  it('returns 404 when plan not found', async () => {
    vi.mocked(SubscriptionPlan.findOne).mockResolvedValue(null as any);
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', { planId: 'bad' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/plan not found/i);
  });

  it('returns 404 when tenantId not found', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', { planId: PLAN_ID }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 500 when PayPal throws', async () => {
    vi.mocked(createSubscriptionPayment).mockRejectedValue(new Error('PayPal API error'));
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', { planId: PLAN_ID }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/paypal api error/i);
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/paypal/create-payment/route');
    const res = await POST(req('POST', '/api/paypal/create-payment', { planId: PLAN_ID }, ''));
    // Route uses generic catch → 500
    expect(res.status).toBe(500);
  });
});

// ── 6.7  GET /api/paypal/success ──────────────────────────────────────────
describe('GET /api/paypal/success (6.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to payment-success when PayPal capture succeeds', async () => {
    vi.mocked(capturePayment).mockResolvedValue({ status: 'COMPLETED' } as any);
    const { GET } = await import('@/app/api/paypal/success/route');
    const res = await GET(
      req('GET', '/api/paypal/success?token=PAYPAL-TOKEN&tenant=demo&lang=en&planId=plan_abc&billingCycle=monthly')
    );

    expect(res.status).toBe(307); // Next.js redirect
    const location = res.headers.get('location');
    expect(location).toContain('/demo/en/subscription/payment-success');
    expect(location).toContain('orderId=PAYPAL-TOKEN');
    expect(location).toContain('planId=plan_abc');
  });

  it('redirects to payment-failed when capture status is not COMPLETED', async () => {
    vi.mocked(capturePayment).mockResolvedValue({ status: 'PENDING' } as any);
    const { GET } = await import('@/app/api/paypal/success/route');
    const res = await GET(
      req('GET', '/api/paypal/success?token=PAYPAL-TOKEN&tenant=demo&lang=en')
    );

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/demo/en/subscription/payment-failed');
  });

  it('redirects to payment-cancel when token is missing', async () => {
    const { GET } = await import('@/app/api/paypal/success/route');
    const res = await GET(req('GET', '/api/paypal/success?tenant=demo&lang=en'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/demo/en/subscription/payment-cancel');
  });

  it('redirects to payment-failed when capturePayment throws', async () => {
    vi.mocked(capturePayment).mockRejectedValue(new Error('network error'));
    const { GET } = await import('@/app/api/paypal/success/route');
    const res = await GET(
      req('GET', '/api/paypal/success?token=PAYPAL-TOKEN&tenant=demo&lang=en')
    );

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/demo/en/subscription/payment-failed');
  });
});

// ── 6.8  GET /api/paypal/cancel ───────────────────────────────────────────
describe('GET /api/paypal/cancel (6.8)', () => {
  it('redirects to subscription page with payment=cancelled', async () => {
    const { GET } = await import('@/app/api/paypal/cancel/route');
    const res = await GET(req('GET', '/api/paypal/cancel?tenant=demo&lang=en'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/demo/en/subscription');
    expect(location).toContain('payment=cancelled');
  });

  it('uses empty basePath when no tenant in query', async () => {
    const { GET } = await import('@/app/api/paypal/cancel/route');
    const res = await GET(req('GET', '/api/paypal/cancel'));

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/subscription');
    expect(location).toContain('payment=cancelled');
  });
});
