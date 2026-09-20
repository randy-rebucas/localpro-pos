process.env.JWT_SECRET = 'test-secret-for-laundry-order-api-tests-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLaundryOrderFindMany = vi.fn();
const mockLaundryOrderFindFirst = vi.fn();
const mockLaundryOrderFindUnique = vi.fn();
const mockLaundryOrderCreate = vi.fn();
const mockLaundryOrderUpdate = vi.fn();
const mockBranchFindFirst = vi.fn();
const mockTransactionFindFirst = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockProductFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    laundryOrder: {
      findMany: (...args: unknown[]) => mockLaundryOrderFindMany(...args),
      findFirst: (...args: unknown[]) => mockLaundryOrderFindFirst(...args),
      findUnique: (...args: unknown[]) => mockLaundryOrderFindUnique(...args),
      create: (...args: unknown[]) => mockLaundryOrderCreate(...args),
      update: (...args: unknown[]) => mockLaundryOrderUpdate(...args),
    },
    branch: {
      findFirst: (...args: unknown[]) => mockBranchFindFirst(...args),
    },
    transaction: {
      findFirst: (...args: unknown[]) => mockTransactionFindFirst(...args),
    },
    customer: {
      findFirst: (...args: unknown[]) => mockCustomerFindFirst(...args),
    },
    product: {
      findMany: (...args: unknown[]) => mockProductFindMany(...args),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 10, resetAfterMs: 0 }),
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue((_key: string, fallback: string) => fallback),
}));

const mockNotifyOrderStatusChange = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifyOrderStatusChange: (...args: unknown[]) => mockNotifyOrderStatusChange(...args),
}));

const mockGetCurrentUser = vi.fn();
const mockRequireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

const mockGetTenantIdFromRequest = vi.fn();
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: (...args: unknown[]) => mockGetTenantIdFromRequest(...args),
}));

const mockHasTenantPermission = vi.fn();
vi.mock('@/lib/permissions-server', () => ({
  hasTenantPermission: (...args: unknown[]) => mockHasTenantPermission(...args),
}));

const mockRequireLaundryOrderAccess = vi.fn();
vi.mock('@/lib/laundry-access', () => ({
  requireLaundryOrderAccess: (...args: unknown[]) => mockRequireLaundryOrderAccess(...args),
}));

import { GET, POST } from '@/app/api/laundry-orders/route';
import { PATCH, DELETE } from '@/app/api/laundry-orders/[id]/route';

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
  const user = { userId, tenantId, email: 'test@example.com', role };
  mockGetCurrentUser.mockResolvedValue(user);
  mockRequireAuth.mockResolvedValue(user);
  mockGetTenantIdFromRequest.mockResolvedValue(tenantId);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTenantPermission.mockResolvedValue(true);
  mockRequireLaundryOrderAccess.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe('GET /api/laundry-orders — tenant isolation', () => {
  it('scopes the list query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockLaundryOrderFindMany.mockResolvedValue([]);

    const res = await GET(createRequest('/api/laundry-orders'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockLaundryOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

describe('PATCH /api/laundry-orders/[id] — tenant isolation', () => {
  it('returns 404 for a laundry order belonging to a different tenant', async () => {
    authAs(TENANT_A);
    // The route scopes findFirst by { id, tenantId: TENANT_A }; a cross-tenant
    // record (owned by TENANT_B) never matches, so the mock returns null,
    // exactly as Postgres would for a tenantId-scoped WHERE clause.
    mockLaundryOrderFindFirst.mockResolvedValue(null);

    const res = await PATCH(
      createRequest('/api/laundry-orders/order-owned-by-tenant-b', 'PATCH', { status: 'received' }),
      { params: Promise.resolve({ id: 'order-owned-by-tenant-b' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockLaundryOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-owned-by-tenant-b', tenantId: TENANT_A } })
    );
    expect(mockLaundryOrderUpdate).not.toHaveBeenCalled();
    void TENANT_B; // documents intent: id would belong to TENANT_B in a real DB
  });
});

// ---------------------------------------------------------------------------
// Status transition validation
// ---------------------------------------------------------------------------

describe('PATCH /api/laundry-orders/[id] — status transitions', () => {
  it('rejects an invalid jump from booked to completed', async () => {
    authAs(TENANT_A);
    mockLaundryOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'booked',
      customerId: null,
    });

    const res = await PATCH(
      createRequest('/api/laundry-orders/order-1', 'PATCH', { status: 'completed' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockLaundryOrderUpdate).not.toHaveBeenCalled();
  });

  it('allows the valid booked -> received transition and stamps receivedAt', async () => {
    authAs(TENANT_A);
    mockLaundryOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'booked',
      customerId: null,
    });
    mockLaundryOrderUpdate.mockResolvedValue({});
    mockLaundryOrderFindUnique.mockResolvedValue({ id: 'order-1', status: 'received' });

    const res = await PATCH(
      createRequest('/api/laundry-orders/order-1', 'PATCH', { status: 'received' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockLaundryOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          status: 'received',
          receivedAt: expect.any(Date),
        }),
      })
    );
  });

  it('fires the order-status-change notification on transition to ready', async () => {
    authAs(TENANT_A);
    mockLaundryOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'folding',
      customerId: 'customer-1',
    });
    mockLaundryOrderUpdate.mockResolvedValue({});
    mockLaundryOrderFindUnique.mockResolvedValue({ id: 'order-1', status: 'ready' });
    mockNotifyOrderStatusChange.mockResolvedValue(undefined);

    const res = await PATCH(
      createRequest('/api/laundry-orders/order-1', 'PATCH', { status: 'ready' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockNotifyOrderStatusChange).toHaveBeenCalledWith(
      TENANT_A,
      'customer-1',
      expect.objectContaining({ orderType: 'laundry', orderId: 'order-1', status: 'ready' })
    );
  });
});

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

describe('POST /api/laundry-orders — feature gate', () => {
  it('blocks creation when enableLaundryOrders resolves false for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireLaundryOrderAccess.mockRejectedValue(
      new Error('Laundry Orders is turned off for this store. Enable it in Settings → Business Features.')
    );

    const res = await POST(
      createRequest('/api/laundry-orders', 'POST', {
        items: [{ name: 'Shirt', unitPrice: 5, quantity: 2 }],
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockLaundryOrderCreate).not.toHaveBeenCalled();
  });

  it('creates the laundry order when the feature is enabled', async () => {
    authAs(TENANT_A);
    mockLaundryOrderCreate.mockImplementation((args: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      Promise.resolve({
        id: 'order-new',
        tenantId: TENANT_A,
        status: 'booked',
        items: args.data.items?.create ?? [],
      })
    );

    const res = await POST(
      createRequest('/api/laundry-orders', 'POST', {
        items: [{ name: 'Shirt', unitPrice: 5, quantity: 2 }],
      })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockLaundryOrderCreate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Line item subtotal / order total computation
// ---------------------------------------------------------------------------

describe('POST /api/laundry-orders — subtotal and total computation', () => {
  it('computes item subtotal as unitPrice * quantity and rolls it up into totalAmount', async () => {
    authAs(TENANT_A);
    mockLaundryOrderCreate.mockImplementation((args: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      Promise.resolve({
        id: 'order-new',
        tenantId: TENANT_A,
        status: 'booked',
        totalAmount: args.data.totalAmount,
        items: args.data.items?.create ?? [],
      })
    );

    const res = await POST(
      createRequest('/api/laundry-orders', 'POST', {
        items: [
          { name: 'Shirt', tagNumber: 'T-001', unitPrice: 5, quantity: 2 },
          { name: 'Jacket', tagNumber: 'T-002', unitPrice: 15, quantity: 1 },
        ],
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.data.items[0].subtotal).toBe(10);
    expect(body.data.items[1].subtotal).toBe(15);
    expect(body.data.totalAmount).toBe(25);
  });

  it('rejects creation with no items', async () => {
    authAs(TENANT_A);

    const res = await POST(createRequest('/api/laundry-orders', 'POST', { items: [] }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockLaundryOrderCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe('DELETE /api/laundry-orders/[id] — cancellation', () => {
  it('soft-cancels the order and stamps cancelledAt', async () => {
    authAs(TENANT_A);
    mockLaundryOrderFindFirst.mockResolvedValue({ id: 'order-1', tenantId: TENANT_A, status: 'booked' });
    mockLaundryOrderUpdate.mockResolvedValue({});

    const res = await DELETE(
      createRequest('/api/laundry-orders/order-1', 'DELETE'),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockLaundryOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ isActive: false, status: 'cancelled', cancelledAt: expect.any(Date) }),
      })
    );
  });
});
