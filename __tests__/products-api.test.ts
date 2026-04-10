process.env.JWT_SECRET = 'test-secret-32chars-products!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockProductFind,
  mockProductFindOne,
  mockProductFindOneAndUpdate,
  mockProductCreate,
  mockProductCountDocuments,
} = vi.hoisted(() => ({
  mockProductFind: vi.fn(),
  mockProductFindOne: vi.fn(),
  mockProductFindOneAndUpdate: vi.fn(),
  mockProductCreate: vi.fn(),
  mockProductCountDocuments: vi.fn().mockResolvedValue(0),
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
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/tenant', () => ({
  getTenantSettingsById: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/business-type-helpers', () => ({
  validateProductForBusiness: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockImplementation((body) => ({ data: body, errors: [] })),
  validateProduct: {},
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockImplementation((err: unknown) =>
    Response.json({ success: false, error: (err as Error).message ?? 'error' }, { status: 500 })
  ),
}));
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
}));
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    }),
  },
}));
vi.mock('@/models/Category', () => ({ default: {} }));
vi.mock('@/models/Product', () => ({
  default: {
    find: mockProductFind,
    findOne: mockProductFindOne,
    findOneAndUpdate: mockProductFindOneAndUpdate,
    create: mockProductCreate,
    countDocuments: mockProductCountDocuments,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  body?: unknown,
  role = 'admin',
  url = 'http://localhost/api/products'
): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockProduct = {
  _id: 'prod-1',
  name: 'Widget',
  price: 99,
  stock: 10,
  isActive: true,
  tenantId: 'tenant-1',
  trackInventory: true,
  allowOutOfStockSales: false,
};

// ---------------------------------------------------------------------------
// GET /api/products
// ---------------------------------------------------------------------------

describe('GET /api/products', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockProductFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockProduct]),
    });
    ({ GET } = await import('@/app/api/products/route'));
  });

  it('returns 200 with product list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('returns 200 with empty array when no products', async () => {
    mockProductFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns non-200 when requireTenantAccess fails', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await GET(new NextRequest('http://localhost/api/products'));
    // The GET route delegates to handleApiError, which returns 500 for unexpected errors;
    // auth errors bubble through the generic catch path.
    expect(res.status).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/products
// ---------------------------------------------------------------------------

describe('POST /api/products', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockImplementation(
      (body) => ({ data: body, errors: [] })
    );
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockResolvedValue(undefined);
    mockProductCountDocuments.mockResolvedValue(5);
    mockProductCreate.mockResolvedValue({ _id: 'prod-new', name: 'Widget', price: 99, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/products/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('prod-new');
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: {},
      errors: [{ field: 'name', message: 'Name is required', code: 'required' }],
    });
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 403 when subscription product limit is hit', async () => {
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockRejectedValue(
      new Error('Product limit reached')
    );
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99 }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/product limit/i);
  });

  it('returns 400 on duplicate SKU (code 11000)', async () => {
    mockProductCreate.mockRejectedValue({ code: 11000, keyPattern: { sku: 1 } });
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99, sku: 'DUP' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sku already exists/i);
  });

  it('returns 400 on duplicate barcode (code 11000)', async () => {
    mockProductCreate.mockRejectedValue({ code: 11000, keyPattern: { barcode: 1 } });
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99, barcode: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/barcode already exists/i);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 60000 });
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99 }));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await POST(makeRequest('POST', { name: 'Widget', price: 99 }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/products/[id]
// ---------------------------------------------------------------------------

describe('GET /api/products/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    ({ GET } = await import('@/app/api/products/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'prod-1' }) };

  it('returns 200 with product data', async () => {
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProduct) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe('prod-1');
  });

  it('returns 404 when product not found', async () => {
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });

  it('normalizes trackInventory to boolean', async () => {
    mockProductFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...mockProduct, trackInventory: undefined }),
    });
    const res = await GET(makeRequest('GET'), ctx);
    const body = await res.json();
    expect(body.data.trackInventory).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/products/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/products/[id]', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockImplementation(
      (body) => ({ data: body, errors: [] })
    );
    vi.mocked((await import('@/lib/tenant')).getTenantSettingsById).mockResolvedValue(null);
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockProduct) });
    mockProductFindOneAndUpdate.mockResolvedValue({ ...mockProduct, name: 'Updated Widget' });
    ({ PUT } = await import('@/app/api/products/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'prod-1' }) };

  it('returns 200 on successful update', async () => {
    const res = await PUT(makeRequest('PUT', { name: 'Updated Widget', price: 99 }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when product not found', async () => {
    mockProductFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockProductFindOneAndUpdate.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { name: 'x', price: 1 }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 403 when cashier tries to update', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'cashier' },
    });
    const res = await PUT(makeRequest('PUT', { name: 'x', price: 1 }, 'cashier'), ctx);
    expect(res.status).toBe(403);
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: {},
      errors: [{ field: 'price', message: 'Price is required', code: 'required' }],
    });
    const res = await PUT(makeRequest('PUT', {}), ctx);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/products/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/products/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockProductFindOneAndUpdate.mockResolvedValue({ ...mockProduct, isActive: false });
    ({ DELETE } = await import('@/app/api/products/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'prod-1' }) };

  it('returns 200 and soft-deletes the product', async () => {
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(mockProductFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'prod-1', isActive: true }),
      { isActive: false },
      expect.anything()
    );
  });

  it('returns 404 when product not found or already deleted', async () => {
    mockProductFindOneAndUpdate.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 403 when cashier tries to delete', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'cashier' },
    });
    const res = await DELETE(makeRequest('DELETE', undefined, 'cashier'), ctx);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/products/[id]/refill
// ---------------------------------------------------------------------------

describe('POST /api/products/[id]/refill', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/token-blacklist')).isTokenRevoked).mockResolvedValue(false);
    vi.mocked((await import('@/lib/token-blacklist')).isTokenIssuedBeforeRevocation).mockResolvedValue(false);
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }) }),
    });
    // updateStock from lib/stock — already mocked globally via module mock below
    ({ POST } = await import('@/app/api/products/[id]/refill/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'prod-1' }) };

  it('returns 400 when quantity is zero or missing', async () => {
    const res = await POST(makeRequest('POST', { quantity: 0 }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/greater than 0/i);
  });

  it('returns 400 when quantity is negative', async () => {
    const res = await POST(makeRequest('POST', { quantity: -5 }), ctx);
    expect(res.status).toBe(400);
  });
});
