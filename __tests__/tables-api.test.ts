process.env.JWT_SECRET = 'test-secret-32chars-tables!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockTableFind,
  mockTableFindOne,
  mockTableCreate,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockTableFind: vi.fn(),
  mockTableFindOne: vi.fn(),
  mockTableCreate: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 }),
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
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock('@/lib/api-tenant', () => ({
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
vi.mock('@/models/Table', () => ({
  default: {
    find: mockTableFind,
    findOne: mockTableFindOne,
    create: mockTableCreate,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest('http://localhost/api/tables', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockTable = {
  _id: 'table-1',
  name: 'Table 1',
  capacity: 4,
  status: 'open',
  isActive: true,
  tenantId: 'tenant-1',
  toObject: () => ({ _id: 'table-1', name: 'Table 1', capacity: 4, status: 'open' }),
};

// ---------------------------------------------------------------------------
// GET /api/tables
// ---------------------------------------------------------------------------

describe('GET /api/tables', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockTableFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockTable]),
    });
    ({ GET } = await import('@/app/api/tables/route'));
  });

  it('returns 200 with table list', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Table 1');
  });

  it('returns 200 with empty array when no tables', async () => {
    mockTableFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns auth error response when requireTenantAccess returns NextResponse', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) as any
    );
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/tables
// ---------------------------------------------------------------------------

describe('POST /api/tables', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    mockTableCreate.mockResolvedValue({ _id: 'table-new', name: 'Table 2', status: 'open', tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/tables/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', { name: 'Table 2', capacity: 4 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('table-new');
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', { capacity: 4 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await POST(makeRequest('POST', { name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when capacity is out of range', async () => {
    const res = await POST(makeRequest('POST', { name: 'VIP Table', capacity: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/capacity/i);
  });

  it('returns 400 when capacity exceeds 100', async () => {
    const res = await POST(makeRequest('POST', { name: 'Big Table', capacity: 101 }));
    expect(res.status).toBe(400);
  });

  it('returns 201 without capacity (optional field)', async () => {
    const res = await POST(makeRequest('POST', { name: 'Simple Table' }));
    expect(res.status).toBe(201);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', { name: 'Table X' }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/tables/[id]
// ---------------------------------------------------------------------------

describe('GET /api/tables/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'table-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockTableFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTable) });
    ({ GET } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 with table data', async () => {
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe('table-1');
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tables/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/tables/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'table-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 59, resetAt: 0 });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockTableFindOne.mockResolvedValue({ ...mockTable, save: saveMock });
    ({ PATCH } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 on successful update', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'Updated Table', status: 'occupied' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: '' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be empty/i);
  });

  it('returns 400 when status is invalid', async () => {
    const res = await PATCH(makeRequest('PATCH', { status: 'invalid-status' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/status must be one of/i);
  });

  it('returns 400 when capacity is out of range', async () => {
    const res = await PATCH(makeRequest('PATCH', { capacity: 200 }), ctx);
    expect(res.status).toBe(400);
  });

  it('accepts valid status values', async () => {
    for (const status of ['open', 'occupied', 'check-requested']) {
      const saveMock = vi.fn().mockResolvedValue(undefined);
      mockTableFindOne.mockResolvedValue({ ...mockTable, save: saveMock });
      const res = await PATCH(makeRequest('PATCH', { status }), ctx);
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await PATCH(makeRequest('PATCH', { name: 'x' }), ctx);
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/tables/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/tables/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'table-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 29, resetAt: 0 });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockTableFindOne.mockResolvedValue({ ...mockTable, save: saveMock });
    ({ DELETE } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 and deactivates the table', async () => {
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(429);
  });
});
