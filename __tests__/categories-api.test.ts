process.env.JWT_SECRET = 'test-secret-32chars-categories!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockCategoryFind,
  mockCategoryFindOne,
  mockCategoryCreate,
} = vi.hoisted(() => ({
  mockCategoryFind: vi.fn(),
  mockCategoryFindOne: vi.fn(),
  mockCategoryCreate: vi.fn(),
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
vi.mock('@/lib/validation', () => ({
  validateAndSanitize: vi.fn().mockImplementation((body) => ({ data: body, errors: [] })),
  validateCategory: {},
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
vi.mock('@/models/Category', () => ({
  default: {
    find: mockCategoryFind,
    findOne: mockCategoryFindOne,
    create: mockCategoryCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest('http://localhost/api/categories', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockCategory = {
  _id: 'cat-1',
  name: 'Electronics',
  isActive: true,
  tenantId: 'tenant-1',
  toObject: () => ({ _id: 'cat-1', name: 'Electronics', isActive: true }),
};

// ---------------------------------------------------------------------------
// GET /api/categories
// ---------------------------------------------------------------------------

describe('GET /api/categories', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockCategoryFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockCategory]),
    });
    ({ GET } = await import('@/app/api/categories/route'));
  });

  it('returns 200 with category list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Electronics');
  });

  it('returns 200 with empty array when no categories', async () => {
    mockCategoryFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 403 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/categories
// ---------------------------------------------------------------------------

describe('POST /api/categories', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockImplementation(
      (body) => ({ data: body, errors: [] })
    );
    mockCategoryCreate.mockResolvedValue({ _id: 'cat-new', name: 'Electronics', tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/categories/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', { name: 'Electronics' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('cat-new');
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: {},
      errors: [{ field: 'name', message: 'Name is required', code: 'required' }],
    });
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on duplicate name (code 11000)', async () => {
    mockCategoryCreate.mockRejectedValue({ code: 11000 });
    const res = await POST(makeRequest('POST', { name: 'Electronics' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await POST(makeRequest('POST', { name: 'Test' }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/categories/[id]
// ---------------------------------------------------------------------------

describe('GET /api/categories/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    ({ GET } = await import('@/app/api/categories/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cat-1' }) };

  it('returns 200 with category data', async () => {
    mockCategoryFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockCategory) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe('cat-1');
  });

  it('returns 404 when category not found', async () => {
    mockCategoryFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/categories/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/categories/[id]', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

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
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockImplementation(
      (body) => ({ data: body, errors: [] })
    );
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockCategoryFindOne.mockResolvedValue({ ...mockCategory, save: saveMock });
    ({ PUT } = await import('@/app/api/categories/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cat-1' }) };

  it('returns 200 on successful update', async () => {
    const res = await PUT(makeRequest('PUT', { name: 'Updated Electronics' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when category not found', async () => {
    mockCategoryFindOne.mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 when validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validateAndSanitize).mockReturnValue({
      data: {},
      errors: [{ field: 'name', message: 'Name required', code: 'required' }],
    });
    const res = await PUT(makeRequest('PUT', {}), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 on duplicate name (code 11000)', async () => {
    const saveMock = vi.fn().mockRejectedValue({ code: 11000 });
    mockCategoryFindOne.mockResolvedValue({ ...mockCategory, save: saveMock });
    const res = await PUT(makeRequest('PUT', { name: 'Duplicate' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/categories/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/categories/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

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
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockCategoryFindOne.mockResolvedValue({ ...mockCategory, isActive: true, save: saveMock });
    ({ DELETE } = await import('@/app/api/categories/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cat-1' }) };

  it('returns 200 and soft-deletes the category', async () => {
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when category not found', async () => {
    mockCategoryFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });
});
