process.env.JWT_SECRET = 'test-secret-32chars-customers!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockCustomerFind,
  mockCustomerFindOne,
  mockCustomerCreate,
  mockCustomerCount,
  mockCheckRateLimit,
} = vi.hoisted(() => ({
  mockCustomerFind: vi.fn(),
  mockCustomerFindOne: vi.fn(),
  mockCustomerCreate: vi.fn(),
  mockCustomerCount: vi.fn(),
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
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/webhooks', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/subscription', () => ({
  checkFeatureAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
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
vi.mock('@/models/Customer', () => ({
  default: {
    find: mockCustomerFind,
    findOne: mockCustomerFindOne,
    create: mockCustomerCreate,
    countDocuments: mockCustomerCount,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest('http://localhost/api/customers', {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockCustomer = {
  _id: 'cust-1',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '555-1234',
  isActive: true,
  tenantId: 'tenant-1',
};

const validCustomerBody = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  phone: '555-1234',
};

// ---------------------------------------------------------------------------
// GET /api/customers
// ---------------------------------------------------------------------------

describe('GET /api/customers', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockCustomerFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockCustomer]),
    });
    mockCustomerCount.mockResolvedValue(1);
    ({ GET } = await import('@/app/api/customers/route'));
  });

  it('returns 200 with customer list and pagination', async () => {
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].firstName).toBe('John');
    expect(body.pagination).toBeDefined();
    expect(body.pagination.total).toBe(1);
  });

  it('returns 200 with empty array when no customers', async () => {
    mockCustomerFind.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    mockCustomerCount.mockResolvedValue(0);
    const res = await GET(makeRequest('GET'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when access denied', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Forbidden: Access denied')
    );
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/customers
// ---------------------------------------------------------------------------

describe('POST /api/customers', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockResolvedValue(undefined);
    mockCustomerFindOne.mockResolvedValue(null); // no existing customer by default
    mockCustomerCreate.mockResolvedValue({ _id: 'cust-new', ...validCustomerBody, tenantId: 'tenant-1' });
    ({ POST } = await import('@/app/api/customers/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', validCustomerBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data._id).toBe('cust-new');
  });

  it('returns 400 when firstName is missing', async () => {
    const res = await POST(makeRequest('POST', { lastName: 'Doe' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/first name is required/i);
  });

  it('returns 400 when lastName is missing', async () => {
    const res = await POST(makeRequest('POST', { firstName: 'John' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/last name is required/i);
  });

  it('returns 400 when email already exists', async () => {
    mockCustomerFindOne.mockResolvedValue(mockCustomer);
    const res = await POST(makeRequest('POST', validCustomerBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email already exists/i);
  });

  it('returns 403 when feature not enabled', async () => {
    vi.mocked((await import('@/lib/subscription')).checkFeatureAccess).mockRejectedValue(
      new Error('Feature not enabled for subscription')
    );
    const res = await POST(makeRequest('POST', validCustomerBody));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await POST(makeRequest('POST', validCustomerBody));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await POST(makeRequest('POST', validCustomerBody));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET /api/customers/[id]
// ---------------------------------------------------------------------------

describe('GET /api/customers/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockCustomer) });
    ({ GET } = await import('@/app/api/customers/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cust-1' }) };

  it('returns 200 with customer data', async () => {
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe('cust-1');
    expect(body.data.firstName).toBe('John');
  });

  it('returns 404 when customer not found', async () => {
    mockCustomerFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 403 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET'), ctx);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/customers/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/customers/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockCustomerFindOne.mockResolvedValue({ ...mockCustomer, save: saveMock });
    ({ PATCH } = await import('@/app/api/customers/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cust-1' }) };

  it('returns 200 on successful update', async () => {
    const res = await PATCH(makeRequest('PATCH', { firstName: 'Jane' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when customer not found', async () => {
    mockCustomerFindOne.mockResolvedValue(null);
    const res = await PATCH(makeRequest('PATCH', { firstName: 'Jane' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await PATCH(makeRequest('PATCH', { firstName: 'Jane' }), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 400 when new email already exists for another customer', async () => {
    // First findOne returns the customer to update, second returns duplicate
    mockCustomerFindOne
      .mockResolvedValueOnce({ ...mockCustomer, save: vi.fn() })
      .mockResolvedValueOnce({ _id: 'other-cust', email: 'taken@example.com' });
    const res = await PATCH(makeRequest('PATCH', { email: 'taken@example.com' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email already exists/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/customers/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/customers/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    const saveMock = vi.fn().mockResolvedValue(undefined);
    mockCustomerFindOne.mockResolvedValue({ ...mockCustomer, isActive: true, save: saveMock });
    ({ DELETE } = await import('@/app/api/customers/[id]/route'));
  });

  const ctx = { params: Promise.resolve({ id: 'cust-1' }) };

  it('returns 200 and soft-deletes the customer', async () => {
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when customer not found', async () => {
    mockCustomerFindOne.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60000 });
    const res = await DELETE(makeRequest('DELETE'), ctx);
    expect(res.status).toBe(429);
  });
});
