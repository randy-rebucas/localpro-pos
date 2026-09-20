process.env.JWT_SECRET = 'test-secret-for-delivery-api-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDeliveryFindMany = vi.fn();
const mockDeliveryFindFirst = vi.fn();
const mockDeliveryFindUnique = vi.fn();
const mockDeliveryCreate = vi.fn();
const mockDeliveryUpdate = vi.fn();
const mockUserFindFirst = vi.fn();
const mockBranchFindFirst = vi.fn();
const mockTransactionFindFirst = vi.fn();
const mockCustomerFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    deliveryOrder: {
      findMany: (...args: unknown[]) => mockDeliveryFindMany(...args),
      findFirst: (...args: unknown[]) => mockDeliveryFindFirst(...args),
      findUnique: (...args: unknown[]) => mockDeliveryFindUnique(...args),
      create: (...args: unknown[]) => mockDeliveryCreate(...args),
      update: (...args: unknown[]) => mockDeliveryUpdate(...args),
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

const mockRequireDeliveryAccess = vi.fn();
vi.mock('@/lib/delivery-access', () => ({
  requireDeliveryAccess: (...args: unknown[]) => mockRequireDeliveryAccess(...args),
}));

import { GET, POST } from '@/app/api/delivery/route';
import { PATCH } from '@/app/api/delivery/[id]/route';

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
  mockRequireDeliveryAccess.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe('GET /api/delivery — tenant isolation', () => {
  it('scopes the list query to the authenticated tenant', async () => {
    authAs(TENANT_A);
    mockDeliveryFindMany.mockResolvedValue([]);

    const res = await GET(createRequest('/api/delivery'));
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDeliveryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

describe('PATCH /api/delivery/[id] — tenant isolation', () => {
  it('returns 404 for a delivery order belonging to a different tenant', async () => {
    authAs(TENANT_A);
    // The route scopes findFirst by { id, tenantId: TENANT_A }; a cross-tenant
    // record (owned by TENANT_B) never matches, so the mock returns null,
    // exactly as Postgres would for a tenantId-scoped WHERE clause.
    mockDeliveryFindFirst.mockResolvedValue(null);

    const res = await PATCH(
      createRequest('/api/delivery/order-owned-by-tenant-b', 'PATCH', { status: 'assigned' }),
      { params: Promise.resolve({ id: 'order-owned-by-tenant-b' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(mockDeliveryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-owned-by-tenant-b', tenantId: TENANT_A } })
    );
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
    void TENANT_B; // documents intent: id would belong to TENANT_B in a real DB
  });
});

// ---------------------------------------------------------------------------
// Status transition validation
// ---------------------------------------------------------------------------

describe('PATCH /api/delivery/[id] — status transitions', () => {
  it('rejects an invalid jump from pending to delivered', async () => {
    authAs(TENANT_A);
    mockDeliveryFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      riderId: null,
      assignedAt: null,
      pickedUpAt: null,
    });

    const res = await PATCH(
      createRequest('/api/delivery/order-1', 'PATCH', { status: 'delivered' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
  });

  it('allows the valid pending -> assigned transition', async () => {
    authAs(TENANT_A);
    mockDeliveryFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      riderId: null,
      assignedAt: null,
      pickedUpAt: null,
    });
    mockUserFindFirst.mockResolvedValue({ id: 'rider-1', tenantId: TENANT_A, role: 'rider', isActive: true });
    mockDeliveryUpdate.mockResolvedValue({});
    mockDeliveryFindUnique.mockResolvedValue({ id: 'order-1', status: 'assigned', riderId: 'rider-1' });

    const res = await PATCH(
      createRequest('/api/delivery/order-1', 'PATCH', { status: 'assigned', riderId: 'rider-1' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDeliveryUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rider assignment sets assignedAt
// ---------------------------------------------------------------------------

describe('PATCH /api/delivery/[id] — rider assignment', () => {
  it('sets assignedAt when a rider is assigned to a previously unassigned order', async () => {
    authAs(TENANT_A);
    mockDeliveryFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      riderId: null,
      assignedAt: null,
      pickedUpAt: null,
    });
    mockUserFindFirst.mockResolvedValue({ id: 'rider-1', tenantId: TENANT_A, role: 'rider', isActive: true });
    mockDeliveryUpdate.mockResolvedValue({});
    mockDeliveryFindUnique.mockResolvedValue({ id: 'order-1', status: 'pending', riderId: 'rider-1' });

    const res = await PATCH(
      createRequest('/api/delivery/order-1', 'PATCH', { riderId: 'rider-1' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(200);
    expect(mockDeliveryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          riderId: 'rider-1',
          assignedAt: expect.any(Date),
        }),
      })
    );
  });

  it('rejects assignment to a rider that does not exist or is inactive', async () => {
    authAs(TENANT_A);
    mockDeliveryFindFirst.mockResolvedValue({
      id: 'order-1',
      tenantId: TENANT_A,
      status: 'pending',
      riderId: null,
      assignedAt: null,
      pickedUpAt: null,
    });
    mockUserFindFirst.mockResolvedValue(null);

    const res = await PATCH(
      createRequest('/api/delivery/order-1', 'PATCH', { riderId: 'nonexistent-rider' }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(404);
    expect(mockDeliveryUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

describe('POST /api/delivery — feature gate', () => {
  it('blocks creation when enableDelivery resolves false for the tenant/business type', async () => {
    authAs(TENANT_A);
    mockRequireDeliveryAccess.mockRejectedValue(
      new Error('Pickup & Delivery is turned off for this store. Enable it in Settings → Business Features.')
    );

    const res = await POST(
      createRequest('/api/delivery', 'POST', {
        type: 'delivery',
        addressStreet: '123 Main St',
        addressCity: 'Metro City',
        addressCountry: 'PH',
      })
    );
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    expect(mockDeliveryCreate).not.toHaveBeenCalled();
  });

  it('creates the delivery order when the feature is enabled', async () => {
    authAs(TENANT_A);
    mockDeliveryCreate.mockResolvedValue({ id: 'order-new', tenantId: TENANT_A, status: 'pending' });

    const res = await POST(
      createRequest('/api/delivery', 'POST', {
        type: 'delivery',
        addressStreet: '123 Main St',
        addressCity: 'Metro City',
        addressCountry: 'PH',
      })
    );
    const { status } = await parseResponse(res);

    expect(status).toBe(201);
    expect(mockDeliveryCreate).toHaveBeenCalled();
  });
});
