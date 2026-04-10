process.env.JWT_SECRET = 'test-secret-32chars-products12!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockProductFind,
  mockProductFindOne,
  mockProductCreate,
  mockProductCount,
  mockTenantFindOne,
  mockSupplierFind,
  mockSupplierCreate,
  mockCheckRateLimit,
  mockRequireTenantAccess,
} = vi.hoisted(() => ({
  mockProductFind: vi.fn(),
  mockProductFindOne: vi.fn(),
  mockProductCreate: vi.fn(),
  mockProductCount: vi.fn(),
  mockTenantFindOne: vi.fn(),
  mockSupplierFind: vi.fn(),
  mockSupplierCreate: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 }),
  mockRequireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
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
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockReturnValue({ data: { name: 'Widget', price: 10 }, errors: [] }),
  validateProduct: vi.fn(),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: {
    updateUsage: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: mockRequireTenantAccess,
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual };
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
vi.mock('@/models/Product', () => ({
  default: {
    find: mockProductFind,
    findOne: mockProductFindOne,
    create: mockProductCreate,
    countDocuments: mockProductCount,
  },
}));
vi.mock('@/models/Category', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: mockTenantFindOne },
}));
vi.mock('@/models/Supplier', () => ({
  default: {
    find: mockSupplierFind,
    create: mockSupplierCreate,
  },
}));

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

const mockProduct = {
  _id: 'prod-1',
  name: 'Widget',
  price: 10,
  sku: 'SKU-001',
  tenantId: 'tenant-1',
  isActive: true,
};

// ===========================================================================
// PRODUCTS
// ===========================================================================

describe('GET /api/products', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    });
    mockProductFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockProduct]),
    });
    ({ GET } = await import('@/app/api/products/route'));
  });

  it('returns 200 with product list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/products'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Widget');
  });

  it('returns 200 with empty array when no products', async () => {
    mockProductFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/products'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 403 when tenant access denied (NextResponse pattern)', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/products'));
    // Route returns the NextResponse from requireTenantAccess
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/products', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: { name: 'Widget', price: 10 },
      errors: [],
    });
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockResolvedValue(undefined);
    mockProductCount.mockResolvedValue(5);
    mockProductCreate.mockResolvedValue({ _id: 'prod-new', name: 'Widget', price: 10, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/products/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', {
      name: 'Widget',
      price: 10,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Widget');
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: null,
      errors: [{ field: 'name', message: 'Name is required' }],
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', { name: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when subscription limit reached', async () => {
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockRejectedValue(
      new Error('Product limit reached on your plan')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', { name: 'x' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/limit reached/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', { name: 'x' }));
    expect(res.status).toBe(429);
  });

  it('returns 400 on duplicate SKU (mongo 11000)', async () => {
    mockProductCreate.mockRejectedValue({ code: 11000, keyPattern: { sku: 1 } });
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', { name: 'Dup' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sku already exists/i);
  });

  it('returns 400 on duplicate barcode (mongo 11000)', async () => {
    mockProductCreate.mockRejectedValue({ code: 11000, keyPattern: { barcode: 1 } });
    const res = await POST(makeRequest('POST', 'http://localhost/api/products', { name: 'Dup' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/barcode/i);
  });
});

// ===========================================================================
// SERVICES (public endpoint — no auth)
// ===========================================================================

describe('GET /api/services', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockTenant = { _id: 'tenant-1', slug: 'demo', name: 'Demo', isActive: true };
  const mockService = { _id: 'svc-1', name: 'Haircut', price: 25, productType: 'service' };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) });
    mockProductFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockService]),
    });
    ({ GET } = await import('@/app/api/services/route'));
  });

  it('returns 200 with service list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/services?tenantId=demo'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Haircut');
  });

  it('returns 400 when tenantId not provided', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/services'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tenantid is required/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/services?tenantId=unknown'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 200 with empty array when no services', async () => {
    mockProductFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/services?tenantId=demo'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ===========================================================================
// SUPPLIERS
// ===========================================================================

describe('GET /api/suppliers', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  const mockSupplier = { _id: 'sup-1', name: 'Acme Corp', tenantId: 'tenant-1', isActive: true };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    });
    mockSupplierFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockSupplier]),
    });
    ({ GET } = await import('@/app/api/suppliers/route'));
  });

  it('returns 200 with supplier list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/suppliers'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Acme Corp');
  });

  it('returns 200 with empty array when no suppliers', async () => {
    mockSupplierFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/suppliers'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns error when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/suppliers'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/suppliers', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
    });
    mockSupplierCreate.mockResolvedValue({
      _id: 'sup-new',
      name: 'New Supplier',
      tenantId: 'tenant-1',
    });
    ({ POST } = await import('@/app/api/suppliers/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/suppliers', {
      name: 'New Supplier',
      contactName: 'Bob',
      email: 'bob@acme.com',
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New Supplier');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/suppliers', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when name is blank', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/suppliers', { name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns error when unauthenticated', async () => {
    mockRequireTenantAccess.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/suppliers', { name: 'x' }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
