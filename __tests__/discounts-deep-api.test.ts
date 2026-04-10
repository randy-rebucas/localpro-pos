/**
 * Discounts & Promotions — deeper coverage for gaps not in existing tests:
 *  - GET /api/discounts: code and activeOnly query filters
 *  - POST /api/discounts: field-length limits, category/requiresIdVerification defaults, audit log, isActive default
 *  - PUT /api/discounts/[id]: mutation applied on document, fixed discount negative value, description length, isActive toggle, audit log
 *  - DELETE /api/discounts/[id]: audit log verification
 */

process.env.JWT_SECRET = 'test-secret-32chars-disc-deep!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockDiscountFind,
  mockDiscountFindOne,
  mockDiscountCreate,
  mockRequireRole,
  mockRequireTenantAccess,
  mockGetTenantId,
  mockCreateAuditLog,
  mockCheckFeatureAccess,
  mockEnsureLegalDiscounts,
} = vi.hoisted(() => ({
  mockDiscountFind: vi.fn(),
  mockDiscountFindOne: vi.fn(),
  mockDiscountCreate: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockRequireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' },
  }),
  mockGetTenantId: vi.fn().mockResolvedValue('tenant-1'),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockCheckFeatureAccess: vi.fn().mockResolvedValue(undefined),
  mockEnsureLegalDiscounts: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
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
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetAfterMs: 0 }),
}));
vi.mock('@/lib/subscription', () => ({ checkFeatureAccess: mockCheckFeatureAccess }));
vi.mock('@/lib/discount-seeds', () => ({
  ensureLegalDiscounts: mockEnsureLegalDiscounts,
  LEGAL_DISCOUNT_CODES: ['SC20', 'PWD20'],
}));
vi.mock('@/lib/tenant', () => ({ getTenantSettingsById: vi.fn().mockResolvedValue({ enableDiscounts: true }) }));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: mockGetTenantId,
  requireTenantAccess: mockRequireTenantAccess,
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireRole: mockRequireRole, requireAuth: vi.fn().mockResolvedValue({ userId: 'user-1', role: 'admin' }) };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Discount', () => ({
  default: {
    find: mockDiscountFind,
    findOne: mockDiscountFindOne,
    create: mockDiscountCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const DISCOUNT_ID = 'disc-1';

const baseDiscount = {
  _id: DISCOUNT_ID,
  code: 'SAVE10',
  name: '10% Off',
  type: 'percentage' as const,
  value: 10,
  category: 'general',
  requiresIdVerification: false,
  isActive: true,
  tenantId: 'tenant-1',
  validFrom: new Date('2020-01-01'),
  validUntil: new Date('2030-12-31'),
  usageLimit: null,
  usageCount: 0,
  minPurchaseAmount: 0,
  maxDiscountAmount: null,
};

const validBody = {
  code: 'PROMO20',
  name: '20% Off',
  type: 'percentage',
  value: 20,
  validFrom: '2024-01-01',
  validUntil: '2024-12-31',
};

// ===========================================================================
// GET /api/discounts — query filter behaviour
// ===========================================================================

describe('GET /api/discounts — query filters', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' },
    });
    mockEnsureLegalDiscounts.mockResolvedValue(undefined);
    mockDiscountFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([baseDiscount]) });
    ({ GET } = await import('@/app/api/discounts/route'));
  });

  it('filters by code when ?code= provided (upcased)', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/discounts?code=save10'));
    expect(mockDiscountFind).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SAVE10' })
    );
  });

  it('does not include code filter when param absent', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/discounts'));
    const query = mockDiscountFind.mock.calls[0][0];
    expect(query).not.toHaveProperty('code');
  });

  it('adds isActive, validFrom, validUntil filters when activeOnly=true', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/discounts?activeOnly=true'));
    const query = mockDiscountFind.mock.calls[0][0];
    expect(query).toHaveProperty('isActive', true);
    expect(query).toHaveProperty('validFrom');
    expect(query).toHaveProperty('validUntil');
  });

  it('does not add isActive filter when activeOnly=false', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/discounts?activeOnly=false'));
    const query = mockDiscountFind.mock.calls[0][0];
    expect(query).not.toHaveProperty('isActive');
  });

  it('returns 403 when tenant access is Forbidden', async () => {
    mockRequireTenantAccess.mockRejectedValue(new Error('Forbidden: not a member'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/discounts'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// POST /api/discounts — field-length, defaults, and audit
// ===========================================================================

describe('POST /api/discounts — validation and defaults', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', role: 'admin' },
    });
    mockRequireRole.mockResolvedValue(undefined);
    mockCheckFeatureAccess.mockResolvedValue(undefined);
    mockDiscountFindOne.mockResolvedValue(null);
    mockDiscountCreate.mockResolvedValue({ _id: 'disc-new', ...validBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/discounts/route'));
  });

  it('returns 400 when code exceeds 50 characters', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      code: 'X'.repeat(51),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/50 characters/i);
  });

  it('returns 400 when name exceeds 100 characters', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      name: 'N'.repeat(101),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/100 characters/i);
  });

  it('returns 400 when description exceeds 500 characters', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      description: 'D'.repeat(501),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500 characters/i);
  });

  it('defaults category to "general" when not provided', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'general' })
    );
  });

  it('stores provided category', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      category: 'senior',
    }));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'senior' })
    );
  });

  it('defaults requiresIdVerification to false', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ requiresIdVerification: false })
    );
  });

  it('sets requiresIdVerification when provided', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      requiresIdVerification: true,
    }));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ requiresIdVerification: true })
    );
  });

  it('defaults isActive to true when not provided', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('initialises usageCount to 0', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ usageCount: 0 })
    );
  });

  it('stores dates as Date objects', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    const created = mockDiscountCreate.mock.calls[0][0];
    expect(created.validFrom).toBeInstanceOf(Date);
    expect(created.validUntil).toBeInstanceOf(Date);
  });

  it('records audit log on creation', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', validBody));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'discount',
        changes: expect.objectContaining({ code: 'PROMO20', type: 'percentage', value: 20 }),
      })
    );
  });

  it('accepts isActive: false to create an inactive discount', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/discounts', {
      ...validBody,
      isActive: false,
    }));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });
});

// ===========================================================================
// PUT /api/discounts/[id] — mutation applied, fixed value, description, audit
// ===========================================================================

describe('PUT /api/discounts/[id] — mutation and audit', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: DISCOUNT_ID }) };

  function makeDoc(overrides: Record<string, unknown> = {}) {
    return { ...baseDiscount, save: vi.fn().mockResolvedValue(undefined), ...overrides };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockDiscountFindOne.mockResolvedValue(makeDoc());
    ({ PUT } = await import('@/app/api/discounts/[id]/route'));
  });

  it('applies name update to document', async () => {
    const doc = makeDoc();
    mockDiscountFindOne.mockResolvedValue(doc);
    await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'Super Sale' }),
      mockParams
    );
    expect(doc.name).toBe('Super Sale');
    expect(doc.save).toHaveBeenCalled();
  });

  it('applies isActive: false to document', async () => {
    const doc = makeDoc();
    mockDiscountFindOne.mockResolvedValue(doc);
    await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { isActive: false }),
      mockParams
    );
    expect(doc.isActive).toBe(false);
  });

  it('returns 400 when fixed discount value is negative', async () => {
    mockDiscountFindOne.mockResolvedValue(makeDoc({ type: 'fixed' }));
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { value: -5 }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/positive/i);
  });

  it('returns 400 when description exceeds 500 characters', async () => {
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, {
        description: 'D'.repeat(501),
      }),
      mockParams
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500 characters/i);
  });

  it('updates category when provided', async () => {
    const doc = makeDoc();
    mockDiscountFindOne.mockResolvedValue(doc);
    await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { category: 'pwd' }),
      mockParams
    );
    expect(doc.category).toBe('pwd');
  });

  it('updates requiresIdVerification when provided', async () => {
    const doc = makeDoc();
    mockDiscountFindOne.mockResolvedValue(doc);
    await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { requiresIdVerification: true }),
      mockParams
    );
    expect(doc.requiresIdVerification).toBe(true);
  });

  it('records audit log on update', async () => {
    await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { name: 'Audit Test' }),
      mockParams
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'discount',
        entityId: DISCOUNT_ID,
        changes: expect.objectContaining({ name: 'Audit Test' }),
      })
    );
  });

  it('does not mutate code even when same code is sent', async () => {
    // Sending the same code value is allowed (no change) — different code is blocked
    const doc = makeDoc();
    mockDiscountFindOne.mockResolvedValue(doc);
    const res = await PUT(
      makeRequest('PUT', `http://localhost/api/discounts/${DISCOUNT_ID}`, { code: 'SAVE10' }),
      mockParams
    );
    // Same code → no error (undefined !== same value check triggers 400 only for different code)
    // Actually in the route: body.code !== discount.code → 400, so same code is fine
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// DELETE /api/discounts/[id] — audit log
// ===========================================================================

describe('DELETE /api/discounts/[id] — audit', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const mockParams = { params: Promise.resolve({ id: DISCOUNT_ID }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    mockGetTenantId.mockResolvedValue('tenant-1');
    mockDiscountFindOne.mockResolvedValue({
      ...baseDiscount,
      deleteOne: vi.fn().mockResolvedValue(undefined),
    });
    ({ DELETE } = await import('@/app/api/discounts/[id]/route'));
  });

  it('records audit log with discount code on delete', async () => {
    await DELETE(
      makeRequest('DELETE', `http://localhost/api/discounts/${DISCOUNT_ID}`),
      mockParams
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'discount',
        entityId: DISCOUNT_ID,
        changes: expect.objectContaining({ code: 'SAVE10' }),
      })
    );
  });

  it('calls deleteOne on the document', async () => {
    const deleteOneFn = vi.fn().mockResolvedValue(undefined);
    mockDiscountFindOne.mockResolvedValue({ ...baseDiscount, deleteOne: deleteOneFn });
    await DELETE(
      makeRequest('DELETE', `http://localhost/api/discounts/${DISCOUNT_ID}`),
      mockParams
    );
    expect(deleteOneFn).toHaveBeenCalled();
  });
});
