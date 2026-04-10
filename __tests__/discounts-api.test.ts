process.env.JWT_SECRET = 'test-secret-32chars-discounts!';
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
} = vi.hoisted(() => ({
  mockDiscountFind: vi.fn(),
  mockDiscountFindOne: vi.fn(),
  mockDiscountCreate: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    DISCOUNT_CREATE: 'DISCOUNT_CREATE',
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
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/discount-seeds', () => ({
  ensureLegalDiscounts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, requireRole: mockRequireRole };
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

function makeRequest(method: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest('http://localhost/api/discounts', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockDiscount = {
  _id: 'disc-1',
  code: 'SAVE10',
  name: '10% Off',
  type: 'percentage',
  value: 10,
  tenantId: 'tenant-1',
  isActive: true,
  validFrom: new Date('2024-01-01'),
  validUntil: new Date('2024-12-31'),
};

const validDiscountBody = {
  code: 'SAVE10',
  name: '10% Off',
  type: 'percentage',
  value: 10,
  validFrom: '2024-01-01',
  validUntil: '2024-12-31',
};

// ---------------------------------------------------------------------------
// GET /api/discounts
// ---------------------------------------------------------------------------

describe('GET /api/discounts', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/discount-seeds')).ensureLegalDiscounts).mockResolvedValue(undefined);
    mockDiscountFind.mockReturnValue({
      sort: vi.fn().mockResolvedValue([mockDiscount]),
    });
    ({ GET } = await import('@/app/api/discounts/route'));
  });

  it('returns 200 with discount list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].code).toBe('SAVE10');
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('auto-seeds legal discounts for tenant', async () => {
    await GET(makeRequest('GET'));
    const { ensureLegalDiscounts } = await import('@/lib/discount-seeds');
    expect(vi.mocked(ensureLegalDiscounts)).toHaveBeenCalledWith('tenant-1');
  });
});

// ---------------------------------------------------------------------------
// POST /api/discounts
// ---------------------------------------------------------------------------

describe('POST /api/discounts', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockDiscountFindOne.mockResolvedValue(null); // no existing discount
    mockDiscountCreate.mockResolvedValue({ _id: 'disc-new', ...validDiscountBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/discounts/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', validDiscountBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('disc-new');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', { code: 'X' })); // missing type, value, dates
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing required fields/i);
  });

  it('returns 400 when validFrom is after validUntil', async () => {
    const res = await POST(makeRequest('POST', {
      ...validDiscountBody,
      validFrom: '2024-12-31',
      validUntil: '2024-01-01',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/end date must be after/i);
  });

  it('returns 400 when percentage discount > 100', async () => {
    const res = await POST(makeRequest('POST', { ...validDiscountBody, type: 'percentage', value: 110 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/percentage/i);
  });

  it('returns 400 when fixed discount is negative', async () => {
    const res = await POST(makeRequest('POST', { ...validDiscountBody, type: 'fixed', value: -5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when discount code already exists', async () => {
    mockDiscountFindOne.mockResolvedValue(mockDiscount);
    const res = await POST(makeRequest('POST', validDiscountBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 400 on duplicate code (mongo 11000)', async () => {
    mockDiscountCreate.mockRejectedValue({ code: 11000 });
    const res = await POST(makeRequest('POST', validDiscountBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 403 when discount feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Discounts not available on your plan')
    );
    const res = await POST(makeRequest('POST', validDiscountBody));
    expect(res.status).toBe(403);
  });

  it('returns 403 when cashier role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await POST(makeRequest('POST', validDiscountBody, 'cashier'));
    expect(res.status).toBe(403);
  });

  it('uppercases the discount code', async () => {
    await POST(makeRequest('POST', { ...validDiscountBody, code: 'save10' }));
    expect(mockDiscountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SAVE10' })
    );
  });
});
