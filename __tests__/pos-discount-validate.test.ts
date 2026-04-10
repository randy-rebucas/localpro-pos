process.env.JWT_SECRET = 'test-secret-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const { mockDiscountFindOne } = vi.hoisted(() => ({
  mockDiscountFindOne: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireAuth: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true }),
}));

vi.mock('@/lib/discount-seeds', () => ({
  ensureLegalDiscounts: vi.fn().mockResolvedValue(undefined),
  LEGAL_DISCOUNT_CODES: ['SC20', 'PWD20'],
}));

vi.mock('@/models/Discount', () => ({
  default: { findOne: mockDiscountFindOne },
}));

vi.mock('@/models/User', () => ({
  default: { findById: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }) }) }) },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date();
const past = new Date(now.getTime() - 86_400_000);   // yesterday
const future = new Date(now.getTime() + 86_400_000); // tomorrow

function makeDiscount(overrides: Record<string, unknown> = {}) {
  return {
    code: 'SAVE10',
    name: '10% Off',
    type: 'percentage',
    value: 10,
    isActive: true,
    validFrom: past,
    validUntil: future,
    usageLimit: null,
    usageCount: 0,
    minPurchaseAmount: null,
    maxDiscountAmount: null,
    category: 'general',
    requiresIdVerification: false,
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  const token = generateToken({ userId: 'u1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest('http://localhost/api/discounts/validate?tenant=test-tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/discounts/validate', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked((await import('@/lib/tenant')).getTenantSettingsById).mockResolvedValue({ enableDiscounts: true });
    ({ POST } = await import('@/app/api/discounts/validate/route'));
  });

  it('returns 400 when code is missing', async () => {
    const res = await POST(makeRequest({ subtotal: 100 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when discount code does not exist', async () => {
    mockDiscountFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest({ code: 'NOPE', subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid or inactive/i);
  });

  it('returns 400 when discount is not yet valid (validFrom in future)', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ validFrom: future, validUntil: future }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not valid at this time/i);
  });

  it('returns 400 when discount has expired', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ validFrom: past, validUntil: past }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when usage limit is reached', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ usageLimit: 10, usageCount: 10 }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/usage limit/i);
  });

  it('returns 400 when minimum purchase is not met', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ minPurchaseAmount: 500 }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/minimum purchase/i);
  });

  it('returns 400 when discounts are disabled for tenant', async () => {
    vi.mocked((await import('@/lib/tenant')).getTenantSettingsById).mockResolvedValue({ enableDiscounts: false });
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not enabled/i);
  });

  it('bypasses tenant discount gate for legal discount SC20', async () => {
    vi.mocked((await import('@/lib/tenant')).getTenantSettingsById).mockResolvedValue({ enableDiscounts: false });
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ code: 'SC20', type: 'percentage', value: 20 }));
    const res = await POST(makeRequest({ code: 'SC20', subtotal: 100 }));
    // Should not return 400 for disabled discounts; gets to discount lookup
    expect(res.status).not.toBe(400);
  });

  it('calculates percentage discount correctly', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ type: 'percentage', value: 10 }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 200 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(20);
    expect(body.data.finalTotal).toBe(180);
  });

  it('caps percentage discount at maxDiscountAmount', async () => {
    mockDiscountFindOne.mockResolvedValue(
      makeDiscount({ type: 'percentage', value: 50, maxDiscountAmount: 100 })
    );
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 400 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(100); // 50% of 400 = 200, capped at 100
  });

  it('calculates fixed discount correctly', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ type: 'fixed', value: 50 }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 200 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(50);
  });

  it('caps fixed discount at subtotal to prevent negative total', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDiscount({ type: 'fixed', value: 500 }));
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(100);
    expect(body.data.finalTotal).toBe(0);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: false,
      resetAfterMs: 60_000,
    });
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(429);
  });

  it('returns discount metadata in success response', async () => {
    mockDiscountFindOne.mockResolvedValue(
      makeDiscount({ category: 'promo', requiresIdVerification: true })
    );
    const res = await POST(makeRequest({ code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(body.data.code).toBe('SAVE10');
    expect(body.data.category).toBe('promo');
    expect(body.data.requiresIdVerification).toBe(true);
  });
});
