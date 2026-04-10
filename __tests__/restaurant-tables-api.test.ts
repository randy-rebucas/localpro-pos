process.env.JWT_SECRET = 'test-secret-32chars-tables!!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockRequireTenantAccess,
  mockCheckRateLimit,
  mockCreateAuditLog,
  mockHandleApiError,
  mockTableFind,
  mockTableFindOne,
  mockTableCreate,
} = vi.hoisted(() => ({
  mockRequireTenantAccess: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  mockCreateAuditLog: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn(),
  mockTableFind: vi.fn(),
  mockTableFindOne: vi.fn(),
  mockTableCreate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn(), generateToken: () => 'test-token' }));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/api-tenant', () => ({ requireTenantAccess: mockRequireTenantAccess }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
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

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: 'auth-token=test-token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id = 'table-id-1') {
  return { params: Promise.resolve({ id }) };
}

const TENANT_ID = 'tenant-id-1';

function makeTableDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => 'table-id-1' },
    tenantId: TENANT_ID,
    name: 'T1',
    capacity: 4,
    status: 'open',
    isActive: true,
    currentOrderId: undefined,
    toObject: vi.fn().mockReturnValue({ _id: 'table-id-1', name: 'T1', status: 'open', isActive: true }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ===========================================================================
// GET /api/tables
// ===========================================================================

describe('GET /api/tables', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    const tables = [makeTableDoc(), makeTableDoc({ name: 'T2', _id: { toString: () => 'table-id-2' } })];
    mockTableFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(tables) }) });
    ({ GET } = await import('@/app/api/tables/route'));
  });

  it('returns 200 with tables list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tables'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('defaults to isActive=true when no param given', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables'));
    expect(mockTableFind).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });

  it('skips isActive filter when isActive=all', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables?isActive=all'));
    const callArg = mockTableFind.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('isActive');
  });

  it('filters by isActive=false', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables?isActive=false'));
    expect(mockTableFind).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });

  it('filters by branchId', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables?branchId=branch-1'));
    expect(mockTableFind).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-1' })
    );
  });

  it('filters by valid status', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables?status=occupied'));
    expect(mockTableFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'occupied' })
    );
  });

  it('ignores invalid status values', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables?status=invalid'));
    const callArg = mockTableFind.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('status');
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/tables'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/tables
// ===========================================================================

describe('POST /api/tables', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const createdTable = {
    _id: { toString: () => 'table-new-1' },
    tenantId: TENANT_ID,
    name: 'Bar 1',
    capacity: 6,
    status: 'open',
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockTableCreate.mockResolvedValue(createdTable);
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ POST } = await import('@/app/api/tables/route'));
  });

  it('returns 201 with created table', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', {
      name: 'Bar 1', capacity: 6,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Bar 1');
    expect(body.data.status).toBe('open');
  });

  it('creates table with status=open and isActive=true', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T5' }));
    expect(mockTableCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'open', isActive: true })
    );
  });

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/table name is required/i);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', { name: '  ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/table name is required/i);
  });

  it('returns 400 when name exceeds 50 characters', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', {
      name: 'A'.repeat(51),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/50 characters/i);
  });

  it('returns 400 when capacity is out of range', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', {
      name: 'T1', capacity: 200,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/capacity must be a number between 1 and 100/i);
  });

  it('returns 400 when capacity is 0', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', {
      name: 'T1', capacity: 0,
    }));
    expect(res.status).toBe(400);
  });

  it('accepts capacity as numeric string', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T1', capacity: '8' }));
    expect(mockTableCreate).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 8 })
    );
  });

  it('omits capacity when not provided', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T1' }));
    const createCall = mockTableCreate.mock.calls[0][0];
    expect(createCall.capacity).toBeUndefined();
  });

  it('calls createAuditLog with CREATE action', async () => {
    await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T1' }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'table' })
    );
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T1' }));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/tables', { name: 'T1' }));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/tables/[id]
// ===========================================================================

describe('GET /api/tables/[id]', () => {
  let GET: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockTableFindOne.mockReturnValue({ lean: () => Promise.resolve(makeTableDoc()) });
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ GET } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 with table data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('T1');
  });

  it('queries by _id and tenantId', async () => {
    await GET(makeRequest('GET', 'http://localhost/api/tables/table-id-1'), makeParams('table-id-1'));
    expect(mockTableFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'table-id-1', tenantId: TENANT_ID })
    );
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await GET(makeRequest('GET', 'http://localhost/api/tables/nope'), makeParams('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/table not found/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/tables/[id]
// ===========================================================================

describe('PATCH /api/tables/[id]', () => {
  let PATCH: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockTableFindOne.mockResolvedValue(makeTableDoc());
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ PATCH } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 and updates table', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      name: 'Table A', capacity: 8,
    }), makeParams());
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('updates status to occupied', async () => {
    const tableDoc = makeTableDoc();
    mockTableFindOne.mockResolvedValue(tableDoc);
    await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      status: 'occupied',
    }), makeParams());
    expect(tableDoc.status).toBe('occupied');
    expect(tableDoc.save).toHaveBeenCalled();
  });

  it('links currentOrderId', async () => {
    const tableDoc = makeTableDoc();
    mockTableFindOne.mockResolvedValue(tableDoc);
    await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      currentOrderId: 'order-abc',
    }), makeParams());
    expect(tableDoc.currentOrderId).toBe('order-abc');
  });

  it('clears currentOrderId when passed null', async () => {
    const tableDoc = makeTableDoc({ currentOrderId: 'order-abc' });
    mockTableFindOne.mockResolvedValue(tableDoc);
    await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      currentOrderId: null,
    }), makeParams());
    expect(tableDoc.currentOrderId).toBeUndefined();
  });

  it('calls createAuditLog with UPDATE action', async () => {
    await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', { name: 'T1 Updated' }), makeParams());
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'table' })
    );
  });

  it('returns 400 when name is empty string', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      name: '',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot be empty/i);
  });

  it('returns 400 when name exceeds 50 characters', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      name: 'X'.repeat(51),
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/50 characters/i);
  });

  it('returns 400 for invalid capacity', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      capacity: 0,
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/capacity must be a number between 1 and 100/i);
  });

  it('returns 400 for invalid status', async () => {
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', {
      status: 'dirty',
    }), makeParams());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/status must be one of/i);
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/nope', { name: 'X' }), makeParams('nope'));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', { name: 'X' }), makeParams());
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await PATCH(makeRequest('PATCH', 'http://localhost/api/tables/table-id-1', { name: 'X' }), makeParams());
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/tables/[id]
// ===========================================================================

describe('DELETE /api/tables/[id]', () => {
  let DELETE: (req: NextRequest, ctx: any) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, role: 'admin' });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockTableFindOne.mockResolvedValue(makeTableDoc());
    mockHandleApiError.mockImplementation((_e: any, msg: string) =>
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
    ({ DELETE } = await import('@/app/api/tables/[id]/route'));
  });

  it('returns 200 and soft-deletes table (sets isActive=false)', async () => {
    const tableDoc = makeTableDoc();
    mockTableFindOne.mockResolvedValue(tableDoc);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(res.status).toBe(200);
    expect(tableDoc.isActive).toBe(false);
    expect(tableDoc.save).toHaveBeenCalled();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deactivated/i);
  });

  it('calls createAuditLog with DELETE action', async () => {
    await DELETE(makeRequest('DELETE', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'table' })
    );
  });

  it('returns 404 when table not found', async () => {
    mockTableFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tables/nope'), makeParams('nope'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/table not found/i);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/tables/table-id-1'), makeParams());
    expect(res.status).toBe(401);
  });
});
