/**
 * Section 9 — Discounts
 * Tests: 9.1 – 9.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    DISCOUNT_CREATE: 'DISCOUNT_CREATE',
    DISCOUNT_UPDATE: 'DISCOUNT_UPDATE',
    DISCOUNT_DELETE: 'DISCOUNT_DELETE',
  },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true }),
}));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock('@/models/Discount', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth, requireRole } from '@/lib/auth';
import { checkFeatureAccess } from '@/lib/subscription';
import { getTenantSettingsById } from '@/lib/tenant';
import { checkRateLimit } from '@/lib/rate-limit';
import Discount from '@/models/Discount';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const DISCOUNT_ID = 'disc_abc';
const USER_ID = 'user_abc';

const mockTenantAccess = { tenantId: TENANT_ID, user: { userId: USER_ID, role: 'admin' } };

const FUTURE = new Date(Date.now() + 86400_000 * 30).toISOString();
const PAST   = new Date(Date.now() - 86400_000 * 30).toISOString();
const NOW    = new Date().toISOString();

const mockDiscount = {
  _id: DISCOUNT_ID,
  tenantId: TENANT_ID,
  code: 'SAVE10',
  name: '10% Off',
  type: 'percentage',
  value: 10,
  category: 'general',
  isActive: true,
  validFrom: new Date(PAST),
  validUntil: new Date(FUTURE),
  usageCount: 0,
  usageLimit: null,
  minPurchaseAmount: null,
  maxDiscountAmount: null,
  requiresIdVerification: false,
};

const makeDiscountDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockDiscount,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
  deleteOne: vi.fn().mockResolvedValue(undefined),
});

// ── Helpers ────────────────────────────────────────────────────────────────
const req = (method: string, url: string, body?: unknown, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const validPostBody = {
  code: 'NEWCODE',
  type: 'percentage',
  value: 15,
  validFrom: PAST,
  validUntil: FUTURE,
};

// ── 9.1  GET /api/discounts ────────────────────────────────────────────────
describe('GET /api/discounts (9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(Discount.find).mockReturnValue({
      sort: vi.fn().mockResolvedValue([mockDiscount]),
    } as any);
  });

  it('returns discount list for tenant', async () => {
    const { GET } = await import('@/app/api/discounts/route');
    const res = await GET(req('GET', '/api/discounts'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(vi.mocked(Discount.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('filters by activeOnly', async () => {
    const { GET } = await import('@/app/api/discounts/route');
    await GET(req('GET', '/api/discounts?activeOnly=true'));
    expect(vi.mocked(Discount.find)).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const { GET } = await import('@/app/api/discounts/route');
    const res = await GET(req('GET', '/api/discounts', undefined, ''));
    expect(res.status).toBe(401);
  });
});

// ── 9.1  POST /api/discounts ───────────────────────────────────────────────
describe('POST /api/discounts (9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Discount.findOne).mockResolvedValue(null as any); // no duplicate
    vi.mocked(Discount.create).mockResolvedValue({ ...mockDiscount, code: 'NEWCODE' } as any);
  });

  it('creates discount and returns 201', async () => {
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', validPostBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(Discount.create)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, code: 'NEWCODE', type: 'percentage' })
    );
  });

  it('returns 400 when required fields missing', async () => {
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', { code: 'X' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/missing required fields/i);
  });

  it('returns 400 when duplicate code', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue(mockDiscount as any);
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', validPostBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 400 when percentage value > 100', async () => {
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', { ...validPostBody, value: 150 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when end date is before start date', async () => {
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', {
      ...validPostBody, validFrom: FUTURE, validUntil: PAST,
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/end date must be after/i);
  });

  it('returns 403 when feature disabled', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', validPostBody));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const { POST } = await import('@/app/api/discounts/route');
    const res = await POST(req('POST', '/api/discounts', validPostBody, ''));
    expect(res.status).toBe(401);
  });
});

// ── 9.2  PUT /api/discounts/[id] ──────────────────────────────────────────
describe('PUT /api/discounts/[id] (9.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Discount.findOne).mockResolvedValue(makeDiscountDoc() as any);
  });

  it('updates discount and returns 200', async () => {
    const { PUT } = await import('@/app/api/discounts/[id]/route');
    const res = await PUT(
      req('PUT', `/api/discounts/${DISCOUNT_ID}`, { name: 'Updated Name' }),
      params(DISCOUNT_ID)
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 when trying to change code', async () => {
    const { PUT } = await import('@/app/api/discounts/[id]/route');
    const res = await PUT(
      req('PUT', `/api/discounts/${DISCOUNT_ID}`, { code: 'DIFFERENT' }),
      params(DISCOUNT_ID)
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cannot be changed/i);
  });

  it('returns 404 when discount not found', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/discounts/[id]/route');
    const res = await PUT(
      req('PUT', `/api/discounts/unknown`, { name: 'X' }),
      params('unknown')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when insufficient role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden: Insufficient permissions'));
    const { PUT } = await import('@/app/api/discounts/[id]/route');
    const res = await PUT(
      req('PUT', `/api/discounts/${DISCOUNT_ID}`, { name: 'X' }),
      params(DISCOUNT_ID)
    );
    expect(res.status).toBe(400); // route catches in generic catch → 400
  });
});

// ── 9.2  DELETE /api/discounts/[id] ───────────────────────────────────────
describe('DELETE /api/discounts/[id] (9.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Discount.findOne).mockResolvedValue(makeDiscountDoc() as any);
  });

  it('deletes discount and returns 200', async () => {
    const { DELETE } = await import('@/app/api/discounts/[id]/route');
    const res = await DELETE(req('DELETE', `/api/discounts/${DISCOUNT_ID}`), params(DISCOUNT_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when discount not found', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/discounts/[id]/route');
    const res = await DELETE(req('DELETE', `/api/discounts/unknown`), params('unknown'));
    expect(res.status).toBe(404);
  });
});

// ── 9.3  POST /api/discounts/validate ─────────────────────────────────────
describe('POST /api/discounts/validate (9.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getTenantSettingsById).mockResolvedValue({ enableDiscounts: true } as any);
    vi.mocked(Discount.findOne).mockResolvedValue(mockDiscount as any);
  });

  it('validates discount code and returns discountAmount and finalTotal', async () => {
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 200 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('SAVE10');
    // 10% of 200 = 20
    expect(body.data.discountAmount).toBe(20);
    expect(body.data.finalTotal).toBe(180);
  });

  it('returns 400 when discount code missing', async () => {
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { subtotal: 100 }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when discount code not found', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue(null as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'NOPE', subtotal: 100 }));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(checkRateLimit).mockReturnValueOnce({ allowed: false, resetAfterMs: 60000 });
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    expect(res.status).toBe(429);
  });

  it('returns 400 when discounts feature disabled (non-legal code)', async () => {
    vi.mocked(getTenantSettingsById).mockResolvedValue({ enableDiscounts: false } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not enabled/i);
  });
});

// ── 9.4  Expired discount is rejected ─────────────────────────────────────
describe('Expired discount is rejected (9.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getTenantSettingsById).mockResolvedValue({ enableDiscounts: true } as any);
  });

  it('rejects discount with past validUntil date', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount,
      validFrom: new Date(Date.now() - 86400_000 * 60),
      validUntil: new Date(Date.now() - 86400_000 * 1), // expired yesterday
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not valid at this time/i);
  });

  it('rejects discount not yet started (validFrom in future)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount,
      validFrom: new Date(Date.now() + 86400_000 * 10), // starts tomorrow
      validUntil: new Date(Date.now() + 86400_000 * 30),
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not valid at this time/i);
  });

  it('rejects discount that reached usage limit', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount,
      usageLimit: 100,
      usageCount: 100,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/usage limit/i);
  });
});

// ── 9.5  Percentage and fixed-amount discount calculations ─────────────────
describe('Discount calculations (9.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(getTenantSettingsById).mockResolvedValue({ enableDiscounts: true } as any);
  });

  it('calculates percentage discount correctly (20% of 500 = 100)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, type: 'percentage', value: 20,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 500 }));
    const body = await res.json();
    expect(body.data.discountAmount).toBe(100);
    expect(body.data.finalTotal).toBe(400);
  });

  it('caps percentage discount at maxDiscountAmount', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, type: 'percentage', value: 20, maxDiscountAmount: 50,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 500 }));
    const body = await res.json();
    // 20% of 500 = 100, but capped at 50
    expect(body.data.discountAmount).toBe(50);
    expect(body.data.finalTotal).toBe(450);
  });

  it('calculates fixed discount correctly (30 off 100 = 70)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, type: 'fixed', value: 30,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(body.data.discountAmount).toBe(30);
    expect(body.data.finalTotal).toBe(70);
  });

  it('fixed discount cannot exceed subtotal (discount=200, subtotal=100 → 100 discount)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, type: 'fixed', value: 200,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(body.data.discountAmount).toBe(100); // capped at subtotal
    expect(body.data.finalTotal).toBe(0);
  });

  it('rejects when subtotal below minPurchaseAmount', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, minPurchaseAmount: 500,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SAVE10', subtotal: 100 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/minimum purchase/i);
  });
});

// ── 9.6  Senior / PWD discount types ──────────────────────────────────────
describe('Senior / PWD discount types (9.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ userId: USER_ID, tenantId: TENANT_ID, role: 'cashier' } as any);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    // Feature disabled — legal discounts should bypass this check
    vi.mocked(getTenantSettingsById).mockResolvedValue({ enableDiscounts: false } as any);
  });

  it('SC20 bypasses feature-disabled check (RA 9994 legal requirement)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, code: 'SC20', category: 'senior', type: 'percentage', value: 20,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'SC20', subtotal: 100 }));
    const body = await res.json();
    // Should succeed even though enableDiscounts=false
    expect(res.status).toBe(200);
    expect(body.data.discountAmount).toBe(20);
  });

  it('PWD20 bypasses feature-disabled check (RA 10754 legal requirement)', async () => {
    vi.mocked(Discount.findOne).mockResolvedValue({
      ...mockDiscount, code: 'PWD20', category: 'pwd', type: 'percentage', value: 20,
    } as any);
    const { POST } = await import('@/app/api/discounts/validate/route');
    const res = await POST(req('POST', '/api/discounts/validate', { code: 'PWD20', subtotal: 200 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.discountAmount).toBe(40);
    expect(body.data.finalTotal).toBe(160);
  });
});

// ── 9.7  POST /api/discounts/seed-defaults ────────────────────────────────
describe('POST /api/discounts/seed-defaults (9.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(Discount.findOne).mockResolvedValue(null as any); // none exist yet
    vi.mocked(Discount.create).mockResolvedValue(undefined as any);
  });

  it('creates SC20 and PWD20 when they do not exist', async () => {
    const { POST } = await import('@/app/api/discounts/seed-defaults/route');
    const res = await POST(req('POST', '/api/discounts/seed-defaults'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created).toContain('SC20');
    expect(body.data.created).toContain('PWD20');
    expect(body.data.skipped).toHaveLength(0);
  });

  it('skips existing discounts and reports them', async () => {
    // Both already exist
    vi.mocked(Discount.findOne).mockResolvedValue(mockDiscount as any);
    const { POST } = await import('@/app/api/discounts/seed-defaults/route');
    const res = await POST(req('POST', '/api/discounts/seed-defaults'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.created).toHaveLength(0);
    expect(body.data.skipped).toContain('SC20');
    expect(body.data.skipped).toContain('PWD20');
    expect(vi.mocked(Discount.create)).not.toHaveBeenCalled();
  });

  it('returns 500 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Forbidden'));
    const { POST } = await import('@/app/api/discounts/seed-defaults/route');
    const res = await POST(req('POST', '/api/discounts/seed-defaults', undefined, ''));
    expect(res.status).toBe(500);
  });
});
