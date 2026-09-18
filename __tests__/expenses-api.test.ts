process.env.JWT_SECRET = 'test-secret-for-expenses-api-tests-32chars!!';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://test:test@localhost:27017/localpro-pos-test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExpenseFindMany = vi.fn();
const mockExpenseFindFirst = vi.fn();
const mockExpenseCreate = vi.fn();
const mockExpenseUpdate = vi.fn();
const mockExpenseUpdateMany = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    expense: {
      findMany: (...args: unknown[]) => mockExpenseFindMany(...args),
      findFirst: (...args: unknown[]) => mockExpenseFindFirst(...args),
      create: (...args: unknown[]) => mockExpenseCreate(...args),
      update: (...args: unknown[]) => mockExpenseUpdate(...args),
      updateMany: (...args: unknown[]) => mockExpenseUpdateMany(...args),
    },
  },
}));

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
  it('scopes the query to the authenticated tenant and excludes soft-deleted rows', async () => {
    authAs(TENANT_A);
    mockExpenseFindMany.mockResolvedValue([{ id: 'e1', tenantId: TENANT_A }]);

    const res = await GET(createRequest('/api/expenses'));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockExpenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, isActive: { not: false } }),
      })
    );
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
    expect(mockExpenseCreate).not.toHaveBeenCalled();
  });

  it('requires name, description, and amount', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/expenses', 'POST', { name: 'Office Supplies' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockExpenseCreate).not.toHaveBeenCalled();
  });

  it('rejects a negative amount', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/expenses', 'POST', { ...validPayload, amount: '-5' }));
    const { status } = await parseResponse(res);

    expect(status).toBe(400);
    expect(mockExpenseCreate).not.toHaveBeenCalled();
  });

  it('creates the expense scoped to the authenticated tenant and user', async () => {
    authAs(TENANT_A, 'owner', 'user-42');
    mockExpenseCreate.mockResolvedValue({ id: 'e1', ...validPayload });

    const res = await POST(createRequest('/api/expenses', 'POST', validPayload));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockExpenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, userId: 'user-42', amount: 49.99 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// PUT /api/expenses/:id
// ---------------------------------------------------------------------------

describe('PUT /api/expenses/:id', () => {
  it('404s when the expense does not belong to the caller tenant', async () => {
    authAs(TENANT_B);
    mockExpenseFindFirst.mockResolvedValue(null);

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockExpenseFindFirst).toHaveBeenCalledWith({ where: { id: 'e1', tenantId: TENANT_B } });
  });

  it('rejects update when the caller lacks expenses.manage', async () => {
    authAs(TENANT_A, 'cashier');
    mockHasTenantPermission.mockResolvedValue(false);

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'Renamed' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status } = await parseResponse(res);

    expect(status).toBe(403);
    expect(mockExpenseFindFirst).not.toHaveBeenCalled();
  });

  it('updates only the fields provided', async () => {
    authAs(TENANT_A);
    const expense = { id: 'e1', name: 'Old Name', amount: 10 };
    mockExpenseFindFirst.mockResolvedValue(expense);
    mockExpenseUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...expense, ...data })
    );

    const res = await PUT(createRequest('/api/expenses/e1', 'PUT', { name: 'New Name' }), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect((body.data as { name: string }).name).toBe('New Name');
    expect((body.data as { amount: number }).amount).toBe(10);
    expect(mockExpenseUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/expenses/:id (soft delete)
// ---------------------------------------------------------------------------

describe('DELETE /api/expenses/:id', () => {
  it('soft-deletes by setting isActive to false via findOneAndUpdate', async () => {
    authAs(TENANT_A);
    mockExpenseUpdateMany.mockResolvedValue({ count: 1 });
    mockExpenseFindFirst.mockResolvedValue({ id: 'e1', name: 'Office Supplies', amount: 49.99 });

    const res = await DELETE(createRequest('/api/expenses/e1', 'DELETE'), {
      params: Promise.resolve({ id: 'e1' }),
    });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockExpenseUpdateMany).toHaveBeenCalledWith({
      where: { id: 'e1', tenantId: TENANT_A, isActive: true },
      data: { isActive: false },
    });
  });

  it('404s for an expense outside the caller tenant or already deleted', async () => {
    authAs(TENANT_B);
    mockExpenseUpdateMany.mockResolvedValue({ count: 0 });

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
    expect(mockExpenseUpdateMany).not.toHaveBeenCalled();
  });
});
