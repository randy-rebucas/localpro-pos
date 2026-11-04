process.env.JWT_SECRET = 'test-secret-for-expenses-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue({ _id: 'audit-1' }),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockRequireTenantAccess = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: (...args: unknown[]) => mockRequireTenantAccess(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const repos = {
  expenses: {
    list: vi.fn(),
    findByIdWithUser: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  isDuplicateKeyError: (e: { code?: number; name?: string } | null) =>
    e?.code === 11000 || e?.name === 'DuplicateKeyError',
}));

import { GET, POST } from '@/app/api/expenses/route';
import { PUT, DELETE } from '@/app/api/expenses/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function createRequest(url: string, method: string = 'GET', body?: Record<string, unknown>): NextRequest {
  const options: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return new NextRequest(new URL(url, 'http://localhost'), options);
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function authAs(tenantId: string, role: string = 'owner', userId: string = 'user-1') {
  mockRequireTenantAccess.mockResolvedValue({
    tenantId,
    user: { userId, tenantId, email: 'test@example.com', role },
  });
}

const validPayload = {
  name: 'Office Supplies',
  description: 'Printer paper and ink',
  amount: '49.99',
  date: '2026-01-15',
  paymentMethod: 'cash',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// GET /api/expenses
// ---------------------------------------------------------------------------

describe('GET /api/expenses', () => {
  it('scopes the list to the authenticated tenant', async () => {
    authAs(TENANT_A);
    repos.expenses.list.mockResolvedValue([{ _id: 'e1', tenantId: TENANT_A }]);

    const res = await GET(createRequest('/api/expenses'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ _id: 'e1', tenantId: TENANT_A }]);
    expect(repos.expenses.list).toHaveBeenCalledWith(TENANT_A, { from: undefined, to: undefined, name: undefined });
  });

  it('passes the date range and name filter through', async () => {
    authAs(TENANT_A);
    repos.expenses.list.mockResolvedValue([]);

    await GET(createRequest('/api/expenses?startDate=2026-01-01&endDate=2026-01-31&name=Rent'));

    expect(repos.expenses.list).toHaveBeenCalledWith(TENANT_A, {
      from: new Date('2026-01-01'),
      to: new Date('2026-01-31'),
      name: 'Rent',
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/expenses
// ---------------------------------------------------------------------------

describe('POST /api/expenses', () => {
  it('rejects creation when the caller lacks expenses.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await POST(createRequest('/api/expenses', 'POST', validPayload));
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.expenses.create).not.toHaveBeenCalled();
  });

  it('requires name, description, and amount', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/expenses', 'POST', { name: 'Office Supplies' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.expenses.create).not.toHaveBeenCalled();
  });

  it('rejects a negative amount', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/expenses', 'POST', { ...validPayload, amount: '-5' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(repos.expenses.create).not.toHaveBeenCalled();
  });

  it('creates the expense scoped to the authenticated tenant and user', async () => {
    authAs(TENANT_A, 'owner', 'user-42');
    repos.expenses.create.mockResolvedValue({ _id: 'e1', ...validPayload });

    const res = await POST(createRequest('/api/expenses', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(repos.expenses.create).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ userId: 'user-42', amount: 49.99, paymentMethod: 'cash' })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /api/expenses/:id
// ---------------------------------------------------------------------------

describe('PUT /api/expenses/:id', () => {
  it('404s when the expense does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    repos.expenses.update.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(repos.expenses.update).toHaveBeenCalledWith(TENANT_B, 'e1', expect.objectContaining({ name: 'Renamed' }));
  });

  it('rejects update when the caller lacks expenses.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.expenses.update).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    repos.expenses.update.mockResolvedValue({
      before: { _id: 'e1', name: 'Old Name', amount: 10 },
      after: { _id: 'e1', name: 'New Name', amount: 10 },
      changed: ['name'],
    });

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'New Name' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.data).toEqual({ _id: 'e1', name: 'New Name', amount: 10 });
    expect(repos.expenses.update).toHaveBeenCalledWith(TENANT_A, 'e1', {
      name: 'New Name',
      description: undefined,
      amount: undefined,
      date: undefined,
      paymentMethod: undefined,
      receipt: undefined,
      notes: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/expenses/:id (soft delete)
// ---------------------------------------------------------------------------

describe('DELETE /api/expenses/:id', () => {
  it('soft-deletes the expense in the caller tenant', async () => {
    authAs(TENANT_A);
    repos.expenses.softDelete.mockResolvedValue({ _id: 'e1', name: 'Office Supplies', amount: 49.99 });

    const res = await DELETE(createRequest('/api/expenses/e1', 'DELETE'), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(repos.expenses.softDelete).toHaveBeenCalledWith(TENANT_A, 'e1');
  });

  it('404s for an expense outside the caller tenant or already deleted', async () => {
    authAs(TENANT_B);
    repos.expenses.softDelete.mockResolvedValue(null);

    const res = await DELETE(createRequest('/api/expenses/e1', 'DELETE'), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
  });

  it('rejects deletion when the caller lacks expenses.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await DELETE(createRequest('/api/expenses/e1', 'DELETE'), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(repos.expenses.softDelete).not.toHaveBeenCalled();
  });
});
