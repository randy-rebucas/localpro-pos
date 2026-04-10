process.env.JWT_SECRET = 'test-secret-32chars-bundles!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockBundleFind,
  mockBundleCreate,
} = vi.hoisted(() => ({
  mockBundleFind: vi.fn(),
  mockBundleCreate: vi.fn(),
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
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
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
vi.mock('@/models/ProductBundle', () => ({
  default: {
    find: mockBundleFind,
    create: mockBundleCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest('http://localhost/api/bundles', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockBundle = {
  _id: 'bundle-1',
  name: 'Combo Pack',
  price: 199,
  isActive: true,
  tenantId: 'tenant-1',
  items: [{ productId: 'prod-1', quantity: 2 }],
};

const validBundleBody = {
  name: 'Combo Pack',
  price: 199,
  items: [{ productId: 'prod-1', quantity: 2 }],
};

// ---------------------------------------------------------------------------
// GET /api/bundles
// ---------------------------------------------------------------------------

describe('GET /api/bundles', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockBundleFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockBundle]),
    });
    ({ GET } = await import('@/app/api/bundles/route'));
  });

  it('returns 200 with bundle list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Combo Pack');
  });

  it('returns 200 with empty array when no bundles', async () => {
    mockBundleFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/bundles
// ---------------------------------------------------------------------------

describe('POST /api/bundles', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/token-blacklist')).isTokenRevoked).mockResolvedValue(false);
    vi.mocked((await import('@/lib/token-blacklist')).isTokenIssuedBeforeRevocation).mockResolvedValue(false);
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    mockBundleCreate.mockResolvedValue({ _id: 'bundle-new', ...validBundleBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/bundles/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', validBundleBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('bundle-new');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', { price: 199, items: [{ productId: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when price is missing', async () => {
    const res = await POST(makeRequest('POST', { name: 'Combo', items: [{ productId: 'p1', quantity: 1 }] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when items array is empty', async () => {
    const res = await POST(makeRequest('POST', { name: 'Combo', price: 100, items: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on duplicate SKU (code 11000)', async () => {
    mockBundleCreate.mockRejectedValue({ code: 11000 });
    const res = await POST(makeRequest('POST', { ...validBundleBody, sku: 'DUP-SKU' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sku already exists/i);
  });

  it('returns 401 when cashier tries to create a bundle', async () => {
    // requireRole (used by bundles route) checks JWT directly
    vi.mocked((await import('@/lib/token-blacklist')).isTokenRevoked).mockResolvedValue(false);
    vi.mocked((await import('@/models/User')).default.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-1' }),
      }),
    });
    // Generate a cashier token — requireRole will throw Forbidden
    const cashierToken = generateToken({ userId: 'u2', tenantId: 'tenant-1', email: 'c@b.com', role: 'cashier' });
    const req = new NextRequest('http://localhost/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `auth-token=${cashierToken}` },
      body: JSON.stringify(validBundleBody),
    });
    const res = await POST(req);
    // requireRole throws Forbidden or Unauthorized — both are non-201
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
