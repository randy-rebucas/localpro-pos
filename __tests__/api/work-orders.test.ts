process.env.JWT_SECRET = 'test-secret-for-work-order-api-tests-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWorkOrderFindMany = vi.fn();
const mockWorkOrderFindFirst = vi.fn();
const mockWorkOrderFindUnique = vi.fn();
const mockWorkOrderCreate = vi.fn();
const mockWorkOrderUpdate = vi.fn();
const mockWorkOrderItemCreate = vi.fn();
const mockUserFindFirst = vi.fn();
const mockBranchFindFirst = vi.fn();
const mockTransactionFindFirst = vi.fn();
const mockCustomerFindFirst = vi.fn();
const mockProductFindMany = vi.fn();
const mockProductFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    workOrder: {
      findMany: (...args: unknown[]) => mockWorkOrderFindMany(...args),
      findFirst: (...args: unknown[]) => mockWorkOrderFindFirst(...args),
      findUnique: (...args: unknown[]) => mockWorkOrderFindUnique(...args),
      create: (...args: unknown[]) => mockWorkOrderCreate(...args),
      update: (...args: unknown[]) => mockWorkOrderUpdate(...args),
    },
    workOrderItem: {
      create: (...args: unknown[]) => mockWorkOrderItemCreate(...args),
    },
    user: {
      findFirst: (...args: unknown[]) => mockUserFindFirst(...args),
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
      findFirst: (...args: unknown[]) => mockProductFindFirst(...args),
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

const mockRequireWorkOrderAccess = vi.fn();
vi.mock('@/lib/work-order-access', () => ({
  requireWorkOrderAccess: (...args: unknown[]) => mockRequireWorkOrderAccess(...args),
}));

import { GET, POST } from '@/app/api/work-orders/route';
import { PATCH } from '@/app/api/work-orders/[id]/route';
import { POST as CREATE_ITEM } from '@/app/api/work-orders/[id]/items/route';

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
  mockRequireWorkOrderAccess.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe('GET /api/work-orders — tenant isolation', () => {
  it('scopes the list query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindMany.mockResolvedValue([]);

    const res = await GET(createRequest('/api/work-orders'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockWorkOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

describe('PATCH /api/work-orders/[id] — tenant isolation', () => {
  it('returns 404 for a work order belonging to a different tenant', async () => {
    authAs(TENANT_A);
    // The route scopes findFirst by { id, tenantId: TENANT_A }; a cross-tenant
    // record (owned by TENANT_B) never matches, so the mock returns null,
    // exactly as Postgres would for a tenantId-scoped WHERE clause.
    mockWorkOrderFindFirst.mockResolvedValue(null);

    const res = await PATCH(
      createRequest('/api/work-orders/order-owned-by-tenant-b', 'PATCH', { status: 'assigned' }),
      { params: Promise.resolve({ id: 'order-owned-by-tenant-b' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockWorkOrderFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-owned-by-tenant-b', tenantId: TENANT_A } })
    );
    expect(mockWorkOrderUpdate).not.toHaveBeenCalled();
    void TENANT_B; // documents intent: id would belong to TENANT_B in a real DB
  });
});

// ---------------------------------------------------------------------------
// Status transition validation
// ---------------------------------------------------------------------------

describe('PATCH /api/work-orders/[id] — status transitions', () => {
  it('rejects an invalid jump from pending to completed', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      assignedToId: null,
      assignedAt: null,
      startedAt: null,
    });

    const res = await PATCH(
      createRequest('/api/work-orders/order-1', 'PATCH', { status: 'completed' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockWorkOrderUpdate).not.toHaveBeenCalled();
  });

  it('allows the valid pending -> assigned transition and sets assignedAt on timestamps', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      assignedToId: null,
      assignedAt: null,
      startedAt: null,
    });
    mockUserFindFirst.mockResolvedValue({ id: 'tech-1', tenantId: TENANT_A, isActive: true });
    mockWorkOrderUpdate.mockResolvedValue({});
    mockWorkOrderFindUnique.mockResolvedValue({ id: 'order-1', status: 'assigned', assignedToId: 'tech-1' });

    const res = await PATCH(
      createRequest('/api/work-orders/order-1', 'PATCH', { status: 'assigned', assignedToId: 'tech-1' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockWorkOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          status: 'assigned',
          assignedToId: 'tech-1',
          assignedAt: expect.any(Date),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Technician assignment sets assignedAt
// ---------------------------------------------------------------------------

describe('PATCH /api/work-orders/[id] — technician assignment', () => {
  it('sets assignedAt when a technician is assigned to a previously unassigned order', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      assignedToId: null,
      assignedAt: null,
      startedAt: null,
    });
    mockUserFindFirst.mockResolvedValue({ id: 'tech-1', tenantId: TENANT_A, isActive: true });
    mockWorkOrderUpdate.mockResolvedValue({});
    mockWorkOrderFindUnique.mockResolvedValue({ id: 'order-1', status: 'pending', assignedToId: 'tech-1' });

    const res = await PATCH(
      createRequest('/api/work-orders/order-1', 'PATCH', { assignedToId: 'tech-1' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockWorkOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          assignedToId: 'tech-1',
          assignedAt: expect.any(Date),
        }),
      })
    );
  });

  it('rejects assignment to a technician that does not exist or is inactive', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      assignedToId: null,
      assignedAt: null,
      startedAt: null,
    });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await PATCH(
      createRequest('/api/work-orders/order-1', 'PATCH', { assignedToId: 'nonexistent-tech' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockWorkOrderUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

describe('POST /api/work-orders — feature gate', () => {
  it('blocks creation when enableWorkOrders resolves false for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireWorkOrderAccess.mockRejectedValue(
      new Error('Job / Work Orders is turned off for this store. Enable it in Settings → Business Features.')
    );

    const res = await POST(
      createRequest('/api/work-orders', 'POST', {
        title: 'Fix AC unit',
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockWorkOrderCreate).not.toHaveBeenCalled();
  });

  it('creates the work order when the feature is enabled', async () => {
    authAs(TENANT_A);
    mockWorkOrderCreate.mockResolvedValue({ id: 'order-new', tenantId: TENANT_A, status: 'pending' });

    const res = await POST(
      createRequest('/api/work-orders', 'POST', {
        title: 'Fix AC unit',
      })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockWorkOrderCreate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Line item subtotal computation
// ---------------------------------------------------------------------------

describe('POST /api/work-orders/[id]/items — subtotal computation', () => {
  it('computes subtotal as price * quantity', async () => {
    authAs(TENANT_A);
    mockWorkOrderFindFirst.mockResolvedValue({ id: 'order-1', tenantId: TENANT_A, status: 'pending' });
    mockWorkOrderItemCreate.mockImplementation((args: any) => Promise.resolve({ id: 'item-1', ...args.data })); // eslint-disable-line @typescript-eslint/no-explicit-any

    const res = await CREATE_ITEM(
      createRequest('/api/work-orders/order-1/items', 'POST', {
        name: 'Compressor',
        itemType: 'part',
        price: 150.5,
        quantity: 2,
      }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.data.subtotal).toBe(301);
    expect(mockWorkOrderItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workOrderId: 'order-1',
          name: 'Compressor',
          itemType: 'part',
          price: 150.5,
          quantity: 2,
          subtotal: 301,
        }),
      })
    );
  });

  it('computes subtotal for a create with initial nested items on the order', async () => {
    authAs(TENANT_A);
    mockRequireWorkOrderAccess.mockResolvedValue(undefined);
    mockWorkOrderCreate.mockImplementation((args: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      Promise.resolve({
        id: 'order-new',
        tenantId: TENANT_A,
        status: 'pending',
        items: args.data.items?.create ?? [],
      })
    );

    const res = await POST(
      createRequest('/api/work-orders', 'POST', {
        title: 'Repair washer',
        items: [{ name: 'Belt', itemType: 'part', price: 20, quantity: 3 }],
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(201);
    expect(body.data.items[0].subtotal).toBe(60);
  });
});
