import { NextRequest, NextResponse } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockConnectDB = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn().mockReturnValue({ allowed: true }));
const mockCreateAuditLog = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetValidationTranslator = vi.hoisted(() =>
  vi.fn().mockResolvedValue((key: string, fallback: string) => fallback)
);
const mockHandleApiError = vi.hoisted(() =>
  vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false, error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  )
);

const mockExpenseFind = vi.hoisted(() => vi.fn());
const mockExpenseFindOne = vi.hoisted(() => vi.fn());
const mockExpenseFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockExpenseCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/api-tenant', () => ({ requireTenantAccess: mockRequireTenantAccess }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: mockCreateAuditLog,
  AuditActions: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: mockGetValidationTranslator,
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/models/Expense', () => ({
  default: {
    find: mockExpenseFind,
    findOne: mockExpenseFindOne,
    findOneAndUpdate: mockExpenseFindOneAndUpdate,
    create: mockExpenseCreate,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-abc';
const USER_ID = 'user-xyz';
const EXPENSE_ID = 'expense-001';

function makeExpenseDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => EXPENSE_ID },
    tenantId: TENANT_ID,
    name: 'Office Supplies',
    description: 'Pens and paper',
    amount: 25.5,
    date: new Date('2024-01-15'),
    paymentMethod: 'cash',
    receipt: undefined,
    notes: undefined,
    userId: USER_ID,
    isActive: true,
    toObject: vi.fn(function () { return { ...this }; }),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRequest(opts: {
  method?: string;
  url?: string;
  body?: Record<string, any>;
  headers?: Record<string, string>;
} = {}): NextRequest {
  const url = opts.url ?? `http://localhost/api/expenses`;
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...opts.headers },
  };
  if (opts.body) init.body = JSON.stringify(opts.body);
  return new NextRequest(url, init);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/expenses', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockExpenseFind.mockReturnValue({
      populate: () => ({ sort: () => ({ lean: () => Promise.resolve([makeExpenseDoc()]) }) }),
    });
  });

  it('returns 200 with expenses list', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });

  it('builds base query with tenantId and isActive filter', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    await GET(makeRequest());
    expect(mockExpenseFind).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, isActive: { $ne: false } })
    );
  });

  it('adds date range when startDate and endDate provided', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    const req = makeRequest({ url: 'http://localhost/api/expenses?startDate=2024-01-01&endDate=2024-01-31' });
    await GET(req);
    const query = mockExpenseFind.mock.calls[0][0];
    expect(query.date.$gte).toBeInstanceOf(Date);
    expect(query.date.$lte).toBeInstanceOf(Date);
  });

  it('adds only startDate when only startDate provided', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    const req = makeRequest({ url: 'http://localhost/api/expenses?startDate=2024-01-01' });
    await GET(req);
    const query = mockExpenseFind.mock.calls[0][0];
    expect(query.date.$gte).toBeInstanceOf(Date);
    expect(query.date.$lte).toBeUndefined();
  });

  it('filters by name when provided', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    const req = makeRequest({ url: 'http://localhost/api/expenses?name=Office+Supplies' });
    await GET(req);
    const query = mockExpenseFind.mock.calls[0][0];
    expect(query.name).toBe('Office Supplies');
  });

  it('does not add name filter when name not provided', async () => {
    const { GET } = await import('@/app/api/expenses/route');
    await GET(makeRequest());
    const query = mockExpenseFind.mock.calls[0][0];
    expect(query.name).toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('@/app/api/expenses/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/expenses', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockExpenseCreate.mockResolvedValue(makeExpenseDoc());
  });

  it('returns 201 with created expense', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Monthly office rent', amount: 1200 },
    }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
  });

  it('creates expense with defaults (paymentMethod=cash)', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Monthly rent', amount: 1200 },
    }));
    expect(mockExpenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: 'cash', tenantId: TENANT_ID, userId: USER_ID })
    );
  });

  it('accepts amount as numeric string', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Supplies', description: 'Paper', amount: '99.99' },
    }));
    expect(res.status).toBe(201);
    expect(mockExpenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 99.99 })
    );
  });

  it('accepts amount of 0', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Free Item', description: 'Complimentary', amount: 0 },
    }));
    expect(res.status).toBe(201);
  });

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { description: 'Some desc', amount: 100 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty string', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: '   ', description: 'Some desc', amount: 100 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', amount: 100 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is empty string', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: '', amount: 100 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Rent desc' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is empty string', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Rent desc', amount: '' },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is negative', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Rent desc', amount: -5 },
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not a number', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Rent desc', amount: 'abc' },
    }));
    expect(res.status).toBe(400);
  });

  it('calls createAuditLog with CREATE action', async () => {
    const { POST } = await import('@/app/api/expenses/route');
    await POST(makeRequest({
      method: 'POST',
      body: { name: 'Rent', description: 'Monthly rent', amount: 1200 },
    }));
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CREATE', entityType: 'expense' })
    );
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({ method: 'POST', body: {} }));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { POST } = await import('@/app/api/expenses/route');
    const res = await POST(makeRequest({ method: 'POST', body: {} }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/expenses/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockExpenseFindOne.mockReturnValue({
      populate: () => ({ lean: () => Promise.resolve(makeExpenseDoc()) }),
    });
  });

  it('returns 200 with expense data', async () => {
    const { GET } = await import('@/app/api/expenses/[id]/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
  });

  it('queries by _id and tenantId', async () => {
    const { GET } = await import('@/app/api/expenses/[id]/route');
    await GET(makeRequest(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(mockExpenseFindOne).toHaveBeenCalledWith({ _id: EXPENSE_ID, tenantId: TENANT_ID });
  });

  it('returns 404 when expense not found', async () => {
    mockExpenseFindOne.mockReturnValue({
      populate: () => ({ lean: () => Promise.resolve(null) }),
    });
    const { GET } = await import('@/app/api/expenses/[id]/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'missing-id' }) });
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { GET } = await import('@/app/api/expenses/[id]/route');
    const res = await GET(makeRequest(), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/expenses/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockExpenseFindOne.mockResolvedValue(makeExpenseDoc());
  });

  it('returns 200 and updates expense', async () => {
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: { name: 'Updated Name' } }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('updates only provided fields', async () => {
    const expenseDoc = makeExpenseDoc();
    mockExpenseFindOne.mockResolvedValue(expenseDoc);
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { name: 'New Name', amount: 500 } }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    expect(expenseDoc.name).toBe('New Name');
    expect(expenseDoc.amount).toBe(500);
  });

  it('calls save() after update', async () => {
    const expenseDoc = makeExpenseDoc();
    mockExpenseFindOne.mockResolvedValue(expenseDoc);
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { description: 'Updated' } }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    expect(expenseDoc.save).toHaveBeenCalled();
  });

  it('calls createAuditLog with UPDATE action', async () => {
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    await PUT(
      makeRequest({ method: 'PUT', body: { name: 'Updated' } }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'UPDATE', entityType: 'expense' })
    );
  });

  it('returns 404 when expense not found', async () => {
    mockExpenseFindOne.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: { name: 'Test' } }),
      { params: Promise.resolve({ id: 'missing-id' }) }
    );
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: {} }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { PUT } = await import('@/app/api/expenses/[id]/route');
    const res = await PUT(
      makeRequest({ method: 'PUT', body: {} }),
      { params: Promise.resolve({ id: EXPENSE_ID }) }
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/expenses/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireTenantAccess.mockResolvedValue({ tenantId: TENANT_ID, user: { userId: USER_ID } });
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockExpenseFindOneAndUpdate.mockResolvedValue(makeExpenseDoc());
  });

  it('returns 200 on successful soft-delete', async () => {
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: EXPENSE_ID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls findOneAndUpdate with isActive=false', async () => {
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(mockExpenseFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: EXPENSE_ID, tenantId: TENANT_ID, isActive: true },
      { isActive: false },
      { new: true }
    );
  });

  it('calls createAuditLog with DELETE action', async () => {
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'DELETE', entityType: 'expense' })
    );
  });

  it('returns 404 when expense not found or already inactive', async () => {
    mockExpenseFindOneAndUpdate.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: 'missing-id' }) });
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireTenantAccess.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const { DELETE } = await import('@/app/api/expenses/[id]/route');
    const res = await DELETE(makeRequest({ method: 'DELETE' }), { params: Promise.resolve({ id: EXPENSE_ID }) });
    expect(res.status).toBe(401);
  });
});
