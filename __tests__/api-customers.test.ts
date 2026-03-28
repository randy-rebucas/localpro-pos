/**
 * Section 7 — Customers
 * Tests: 7.1 – 7.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────
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
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
}));
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn((error: unknown) => {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ success: false, error: msg }, { status: 500 });
  }),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
}));
vi.mock('@/lib/automations/customer-welcome', () => ({
  sendCustomerWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/models/Customer', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
vi.mock('@/models/User', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: { findOne: vi.fn() },
}));
vi.mock('@/models/Address', () => ({
  default: {
    findById: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateMany: vi.fn().mockResolvedValue(undefined),
    countDocuments: vi.fn(),
    create: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { checkFeatureAccess } from '@/lib/subscription';
import { validateEmail } from '@/lib/validation';
import Customer from '@/models/Customer';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import Address from '@/models/Address';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const USER_ID = 'user_abc';
const CUSTOMER_ID = 'cust_abc';
const ADDRESS_ID = 'addr_abc';

const mockTenantAccess = { tenantId: TENANT_ID, user: { userId: USER_ID, role: 'admin' } };

const mockCustomer = {
  _id: CUSTOMER_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '555-1234',
  isActive: true,
};

const makeCustomerDoc = (overrides: Record<string, unknown> = {}) => ({
  ...mockCustomer,
  ...overrides,
  save: vi.fn().mockResolvedValue(undefined),
});

const mockTenant = { _id: TENANT_ID, slug: 'demo', isActive: true };

const mockUser = {
  _id: USER_ID,
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  isActive: true,
};

const mockAddress = {
  _id: ADDRESS_ID,
  userId: { toString: () => USER_ID },
  tenantId: TENANT_ID,
  street: '123 Main St',
  city: 'Anytown',
  country: 'US',
  isDefault: true,
  isActive: true,
  save: vi.fn().mockResolvedValue(undefined),
};

// ── Helpers ────────────────────────────────────────────────────────────────
const req = (method: string, url: string, body?: unknown, token = 'Bearer tok') =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const addrParams = (addressId: string) => ({ params: Promise.resolve({ addressId }) });

// ── 7.1  GET /api/customers ────────────────────────────────────────────────
describe('GET /api/customers (7.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(Customer.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([mockCustomer]),
          }),
        }),
      }),
    } as any);
    vi.mocked(Customer.countDocuments).mockResolvedValue(1 as any);
  });

  it('returns tenant customers with pagination', async () => {
    const { GET } = await import('@/app/api/customers/route');
    const res = await GET(req('GET', '/api/customers'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toMatchObject({ total: 1, page: 1 });
    // Verify tenant isolation: find called with tenantId
    expect(vi.mocked(Customer.find)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID })
    );
  });

  it('returns 403 when no tenantId', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(null);
    const { GET } = await import('@/app/api/customers/route');
    const res = await GET(req('GET', '/api/customers', undefined, ''));
    expect(res.status).toBe(403);
  });

  it('applies search filter', async () => {
    const { GET } = await import('@/app/api/customers/route');
    await GET(req('GET', '/api/customers?search=jane'));
    expect(vi.mocked(Customer.find)).toHaveBeenCalledWith(
      expect.objectContaining({ $or: expect.any(Array) })
    );
  });

  it('filters by isActive', async () => {
    const { GET } = await import('@/app/api/customers/route');
    await GET(req('GET', '/api/customers?isActive=true'));
    expect(vi.mocked(Customer.find)).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true })
    );
  });
});

// ── 7.2  POST /api/customers ───────────────────────────────────────────────
describe('POST /api/customers (7.2)', () => {
  const validBody = { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(checkFeatureAccess).mockResolvedValue(undefined);
    vi.mocked(Customer.findOne).mockResolvedValue(null as any); // no duplicate email
    vi.mocked(Customer.create).mockResolvedValue({
      ...mockCustomer,
      _id: CUSTOMER_ID,
      email: 'jane@example.com',
    } as any);
  });

  it('creates customer and returns 201', async () => {
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', validBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(Customer.create)).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID, firstName: 'Jane', isActive: true })
    );
  });

  it('returns 400 when firstName is missing', async () => {
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', { lastName: 'Doe' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/first name/i);
  });

  it('returns 400 when lastName is missing', async () => {
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', { firstName: 'Jane' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/last name/i);
  });

  it('returns 400 when email already exists', async () => {
    vi.mocked(Customer.findOne).mockResolvedValue(mockCustomer as any);
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', validBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/email already exists/i);
  });

  it('returns 403 when feature access denied', async () => {
    vi.mocked(checkFeatureAccess).mockRejectedValue(new Error('Feature not available'));
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', validBody));
    const body = await res.json();
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const { POST } = await import('@/app/api/customers/route');
    const res = await POST(req('POST', '/api/customers', validBody, ''));
    expect(res.status).toBe(401);
  });
});

// ── 7.3  PATCH /api/customers/[id] ────────────────────────────────────────
describe('PATCH /api/customers/[id] (7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(Customer.findOne).mockResolvedValue(makeCustomerDoc() as any);
  });

  it('updates customer and returns 200', async () => {
    const { PATCH } = await import('@/app/api/customers/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/customers/${CUSTOMER_ID}`, { firstName: 'Janet' }),
      params(CUSTOMER_ID)
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when customer not found', async () => {
    vi.mocked(Customer.findOne).mockResolvedValue(null as any);
    const { PATCH } = await import('@/app/api/customers/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/customers/unknown`, { firstName: 'X' }),
      params('unknown')
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const { PATCH } = await import('@/app/api/customers/[id]/route');
    const res = await PATCH(
      req('PATCH', `/api/customers/${CUSTOMER_ID}`, { firstName: 'X' }, ''),
      params(CUSTOMER_ID)
    );
    expect(res.status).toBe(401);
  });
});

// ── 7.3  DELETE /api/customers/[id] ───────────────────────────────────────
describe('DELETE /api/customers/[id] (7.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue(mockTenantAccess as any);
    vi.mocked(Customer.findOne).mockResolvedValue(makeCustomerDoc() as any);
  });

  it('soft-deletes customer (isActive=false) and returns 200', async () => {
    const { DELETE } = await import('@/app/api/customers/[id]/route');
    const res = await DELETE(req('DELETE', `/api/customers/${CUSTOMER_ID}`), params(CUSTOMER_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/deleted/i);
  });

  it('returns 404 when customer not found', async () => {
    vi.mocked(Customer.findOne).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/customers/[id]/route');
    const res = await DELETE(req('DELETE', `/api/customers/unknown`), params('unknown'));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const { DELETE } = await import('@/app/api/customers/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/customers/${CUSTOMER_ID}`, undefined, ''),
      params(CUSTOMER_ID)
    );
    expect(res.status).toBe(401);
  });
});

// ── 7.4  GET /api/client/profile ──────────────────────────────────────────
describe('GET /api/client/profile (7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'admin',
    } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      }),
    } as any);
  });

  it('returns user profile', async () => {
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', `/api/client/profile?userId=${USER_ID}&tenantId=demo`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('admin@example.com');
  });

  it('returns 400 when userId or tenantId missing', async () => {
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', '/api/client/profile'));
    expect(res.status).toBe(400);
  });

  it('returns 403 when user tries to view another profile (non-admin)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'other_user', tenantId: TENANT_ID, role: 'cashier',
    } as any);
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', `/api/client/profile?userId=${USER_ID}&tenantId=demo`));
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', `/api/client/profile?userId=${USER_ID}&tenantId=demo`));
    expect(res.status).toBe(404);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as any);
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', `/api/client/profile?userId=${USER_ID}&tenantId=demo`));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { GET } = await import('@/app/api/client/profile/route');
    const res = await GET(req('GET', `/api/client/profile?userId=${USER_ID}&tenantId=demo`, undefined, ''));
    expect(res.status).toBe(401);
  });
});

// ── 7.4  PUT /api/client/profile ──────────────────────────────────────────
describe('PUT /api/client/profile (7.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'admin',
    } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(User.findOne).mockResolvedValue(null as any); // no duplicate email
    vi.mocked(User.findOneAndUpdate).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...mockUser, name: 'Updated Name' }),
      }),
    } as any);
  });

  it('updates user profile', async () => {
    const { PUT } = await import('@/app/api/client/profile/route');
    const res = await PUT(
      req('PUT', `/api/client/profile?userId=${USER_ID}&tenantId=demo`, { name: 'Updated Name' })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
  });

  it('returns 400 when no fields to update', async () => {
    const { PUT } = await import('@/app/api/client/profile/route');
    const res = await PUT(req('PUT', `/api/client/profile?userId=${USER_ID}&tenantId=demo`, {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    vi.mocked(validateEmail).mockReturnValue(false);
    const { PUT } = await import('@/app/api/client/profile/route');
    const res = await PUT(
      req('PUT', `/api/client/profile?userId=${USER_ID}&tenantId=demo`, { email: 'bad-email' })
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid email/i);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { PUT } = await import('@/app/api/client/profile/route');
    const res = await PUT(
      req('PUT', `/api/client/profile?userId=${USER_ID}&tenantId=demo`, { name: 'X' }, '')
    );
    expect(res.status).toBe(401);
  });
});

// ── 7.5  POST /api/client/address ─────────────────────────────────────────
describe('POST /api/client/address (7.5)', () => {
  const validAddrBody = {
    tenantId: 'demo',
    street: '123 Main St',
    city: 'Anytown',
    country: 'US',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'cashier',
    } as any);
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(Address.countDocuments).mockResolvedValue(0 as any);
    vi.mocked(Address.create).mockResolvedValue({
      _id: ADDRESS_ID,
      ...validAddrBody,
      userId: USER_ID,
      isDefault: true,
    } as any);
  });

  it('creates address and returns 201', async () => {
    const { POST } = await import('@/app/api/client/address/route');
    const res = await POST(req('POST', '/api/client/address', validAddrBody));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(vi.mocked(Address.create)).toHaveBeenCalledWith(
      expect.objectContaining({ street: '123 Main St', city: 'Anytown', country: 'US' })
    );
  });

  it('first address is auto-set as default', async () => {
    vi.mocked(Address.countDocuments).mockResolvedValue(0 as any);
    const { POST } = await import('@/app/api/client/address/route');
    await POST(req('POST', '/api/client/address', validAddrBody));
    expect(vi.mocked(Address.create)).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true })
    );
  });

  it('returns 400 when required fields missing', async () => {
    const { POST } = await import('@/app/api/client/address/route');
    const res = await POST(req('POST', '/api/client/address', { tenantId: 'demo', street: '123' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/required/i);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { POST } = await import('@/app/api/client/address/route');
    const res = await POST(req('POST', '/api/client/address', validAddrBody));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { POST } = await import('@/app/api/client/address/route');
    const res = await POST(req('POST', '/api/client/address', validAddrBody, ''));
    expect(res.status).toBe(401);
  });
});

// ── 7.6  PUT /api/client/address/[addressId] ──────────────────────────────
describe('PUT /api/client/address/[addressId] (7.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'cashier',
    } as any);
    vi.mocked(Address.findById).mockResolvedValue({ ...mockAddress } as any);
    vi.mocked(Address.findByIdAndUpdate).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ ...mockAddress, city: 'Newtown' }),
    } as any);
  });

  it('updates address and returns 200', async () => {
    const { PUT } = await import('@/app/api/client/address/[addressId]/route');
    const res = await PUT(
      req('PUT', `/api/client/address/${ADDRESS_ID}`, { city: 'Newtown' }),
      addrParams(ADDRESS_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when address not found', async () => {
    vi.mocked(Address.findById).mockResolvedValue(null as any);
    const { PUT } = await import('@/app/api/client/address/[addressId]/route');
    const res = await PUT(
      req('PUT', `/api/client/address/unknown`, { city: 'X' }),
      addrParams('unknown')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when address belongs to another user', async () => {
    vi.mocked(Address.findById).mockResolvedValue({
      ...mockAddress,
      userId: { toString: () => 'other_user' },
    } as any);
    const { PUT } = await import('@/app/api/client/address/[addressId]/route');
    const res = await PUT(
      req('PUT', `/api/client/address/${ADDRESS_ID}`, { city: 'X' }),
      addrParams(ADDRESS_ID)
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when no fields to update', async () => {
    const { PUT } = await import('@/app/api/client/address/[addressId]/route');
    const res = await PUT(
      req('PUT', `/api/client/address/${ADDRESS_ID}`, {}),
      addrParams(ADDRESS_ID)
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { PUT } = await import('@/app/api/client/address/[addressId]/route');
    const res = await PUT(
      req('PUT', `/api/client/address/${ADDRESS_ID}`, { city: 'X' }, ''),
      addrParams(ADDRESS_ID)
    );
    expect(res.status).toBe(401);
  });
});

// ── 7.6  DELETE /api/client/address/[addressId] ───────────────────────────
describe('DELETE /api/client/address/[addressId] (7.6)', () => {
  const makeAddrDoc = (overrides: Record<string, unknown> = {}) => ({
    ...mockAddress,
    ...overrides,
    save: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: USER_ID, tenantId: TENANT_ID, role: 'cashier',
    } as any);
    // Use isDefault: false so route doesn't attempt to promote a next default
    vi.mocked(Address.findOne).mockResolvedValue(makeAddrDoc({ isDefault: false }) as any);
  });

  it('soft-deletes address and returns 200', async () => {
    const { DELETE } = await import('@/app/api/client/address/[addressId]/route');
    const res = await DELETE(
      req('DELETE', `/api/client/address/${ADDRESS_ID}`),
      addrParams(ADDRESS_ID)
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('promotes next address when default is deleted', async () => {
    const nextAddr = { isDefault: false, save: vi.fn().mockResolvedValue(undefined) };
    // Second findOne call returns next address candidate
    vi.mocked(Address.findOne)
      .mockResolvedValueOnce(makeAddrDoc({ isDefault: true }) as any)
      .mockReturnValueOnce({ sort: vi.fn().mockResolvedValue(nextAddr) } as any);

    const { DELETE } = await import('@/app/api/client/address/[addressId]/route');
    await DELETE(req('DELETE', `/api/client/address/${ADDRESS_ID}`), addrParams(ADDRESS_ID));

    expect(nextAddr.save).toHaveBeenCalled();
  });

  it('returns 404 when address not found', async () => {
    vi.mocked(Address.findOne).mockResolvedValue(null as any);
    const { DELETE } = await import('@/app/api/client/address/[addressId]/route');
    const res = await DELETE(
      req('DELETE', `/api/client/address/unknown`),
      addrParams('unknown')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when address belongs to another user', async () => {
    vi.mocked(Address.findOne).mockResolvedValue(
      makeAddrDoc({ userId: { toString: () => 'other_user' } }) as any
    );
    const { DELETE } = await import('@/app/api/client/address/[addressId]/route');
    const res = await DELETE(
      req('DELETE', `/api/client/address/${ADDRESS_ID}`),
      addrParams(ADDRESS_ID)
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new Error('Unauthorized'));
    const { DELETE } = await import('@/app/api/client/address/[addressId]/route');
    const res = await DELETE(
      req('DELETE', `/api/client/address/${ADDRESS_ID}`, undefined, ''),
      addrParams(ADDRESS_ID)
    );
    expect(res.status).toBe(401);
  });
});
