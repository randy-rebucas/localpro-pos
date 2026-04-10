process.env.JWT_SECRET = 'test-secret-32chars-users!!!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockUserFind,
  mockUserFindOne,
  mockUserFindOneAndUpdate,
  mockUserFindOneAndDelete,
  mockUserCreate,
  mockUserCount,
  mockRequireRole,
  mockRevokeAllUserTokens,
} = vi.hoisted(() => ({
  mockUserFind: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockUserFindOneAndUpdate: vi.fn(),
  mockUserFindOneAndDelete: vi.fn(),
  mockUserCreate: vi.fn(),
  mockUserCount: vi.fn(),
  mockRequireRole: vi.fn().mockResolvedValue(undefined),
  mockRevokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: {
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    USER_ROLE_CHANGE: 'USER_ROLE_CHANGE',
  },
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
  revokeAllUserTokens: mockRevokeAllUserTokens,
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));
vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: {
    updateUsage: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant-1'),
  requireTenantAccess: vi.fn().mockResolvedValue({
    tenantId: 'tenant-1',
    user: { userId: 'user-1', tenantId: 'tenant-1', email: 'admin@test.com', role: 'admin' },
  }),
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    requireRole: mockRequireRole,
  };
});
vi.mock('@/models/User', () => ({
  default: {
    find: mockUserFind,
    findOne: mockUserFindOne,
    findOneAndUpdate: mockUserFindOneAndUpdate,
    findOneAndDelete: mockUserFindOneAndDelete,
    create: mockUserCreate,
    countDocuments: mockUserCount,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown, role = 'admin'): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockUser = {
  _id: 'user-2',
  name: 'Staff User',
  email: 'staff@test.com',
  role: 'cashier',
  isActive: true,
  tenantId: 'tenant-1',
};

const validUserBody = {
  email: 'newuser@test.com',
  password: 'SecurePass123!',
  name: 'New User',
  role: 'cashier',
};

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------

describe('GET /api/users', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    mockUserFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockUser]),
    });
    ({ GET } = await import('@/app/api/users/route'));
  });

  it('returns 200 with user list', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/users'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe('staff@test.com');
  });

  it('returns 200 with empty array when no users', async () => {
    mockUserFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/users'));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await GET(makeRequest('GET', 'http://localhost/api/users'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when cashier role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/users', undefined, 'cashier'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------

describe('POST /api/users', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      user: { userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' },
    });
    vi.mocked((await import('@/lib/validation')).validateEmail).mockReturnValue(true);
    vi.mocked((await import('@/lib/validation')).validatePassword).mockReturnValue({ valid: true, errors: [] });
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockResolvedValue(undefined);
    mockUserCount.mockResolvedValue(2);
    mockUserCreate.mockResolvedValue({
      ...mockUser,
      _id: 'user-new',
      email: 'newuser@test.com',
      toObject: () => ({ _id: 'user-new', email: 'newuser@test.com', password: 'hashed', name: 'New User', role: 'cashier' }),
    });
    ({ POST } = await import('@/app/api/users/route'));
  });

  it('returns 201 on successful creation', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', validUserBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('newuser@test.com');
    expect(body.data.password).toBeUndefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', { email: 'a@b.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 400 when email format is invalid', async () => {
    vi.mocked((await import('@/lib/validation')).validateEmail).mockReturnValue(false);
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', { ...validUserBody, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it('returns 400 when password validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validatePassword).mockReturnValue({
      valid: false,
      errors: ['Password too weak'],
    });
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', { ...validUserBody, password: 'weak' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', { ...validUserBody, role: 'superuser' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid role/i);
  });

  it('returns 403 when subscription user limit reached', async () => {
    vi.mocked((await import('@/lib/subscription')).checkSubscriptionLimit).mockRejectedValue(
      new Error('User limit reached for your plan')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', validUserBody));
    expect(res.status).toBe(403);
  });

  it('returns 400 on duplicate email (code 11000)', async () => {
    mockUserCreate.mockRejectedValue({ code: 11000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', validUserBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked((await import('@/lib/api-tenant')).requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: No token')
    );
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', validUserBody));
    expect(res.status).toBe(401);
  });

  it('returns 403 when cashier role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/users', validUserBody, 'cashier'));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/[id]
// ---------------------------------------------------------------------------

describe('GET /api/users/[id]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'user-2' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockUser),
    });
    ({ GET } = await import('@/app/api/users/[id]/route'));
  });

  it('returns 200 with user data', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data._id).toBe('user-2');
    expect(body.data.email).toBe('staff@test.com');
  });

  it('returns 404 when user not found', async () => {
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET(makeRequest('GET', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 403 when cashier role', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/users/user-2', undefined, 'cashier'), ctx);
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/users/[id]', () => {
  let PUT: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'user-2' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    vi.mocked((await import('@/lib/validation')).validateEmail).mockReturnValue(true);
    vi.mocked((await import('@/lib/validation')).validatePassword).mockReturnValue({ valid: true, errors: [] });
    mockRevokeAllUserTokens.mockResolvedValue(undefined);
    // findOne for old user lookup
    mockUserFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    // findOneAndUpdate returns updated user (with .select chained)
    mockUserFindOneAndUpdate.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUser, name: 'Updated Name' }),
    });
    ({ PUT } = await import('@/app/api/users/[id]/route'));
  });

  it('returns 200 on successful update', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { name: 'Updated Name' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 when user not found on lookup', async () => {
    mockUserFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { name: 'x' }), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 when email format is invalid', async () => {
    vi.mocked((await import('@/lib/validation')).validateEmail).mockReturnValue(false);
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { email: 'bad' }), ctx);
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { name: '   ' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name is required/i);
  });

  it('returns 400 when role is invalid', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { role: 'hacker' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid role/i);
  });

  it('returns 400 when password validation fails', async () => {
    vi.mocked((await import('@/lib/validation')).validatePassword).mockReturnValue({
      valid: false,
      errors: ['Too short'],
    });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { password: 'weak' }), ctx);
    expect(res.status).toBe(400);
  });

  it('revokes tokens when password is changed', async () => {
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/users/user-2', { password: 'NewSecurePass1!' }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith('user-2');
  });

  it('revokes tokens when account is deactivated', async () => {
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/users/user-2', { isActive: false }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(mockRevokeAllUserTokens).toHaveBeenCalledWith('user-2');
  });

  it('returns 400 on duplicate email (code 11000)', async () => {
    mockUserFindOneAndUpdate.mockReturnValue({
      select: vi.fn().mockRejectedValue({ code: 11000 }),
    });
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { email: 'taken@test.com' }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/users/user-2', { name: 'x' }), ctx);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/users/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  const ctx = { params: Promise.resolve({ id: 'user-2' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(undefined);
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue('tenant-1');
    mockUserFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockUserFindOneAndDelete.mockResolvedValue(mockUser);
    ({ DELETE } = await import('@/app/api/users/[id]/route'));
  });

  it('returns 200 and deletes the user', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockUserFindOneAndDelete).toHaveBeenCalledWith({ _id: 'user-2', tenantId: 'tenant-1' });
  });

  it('returns 404 when user not found', async () => {
    mockUserFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 403 when non-admin tries to delete', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden: Insufficient permissions'));
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/user-2', undefined, 'manager'), ctx);
    expect(res.status).toBe(403);
  });

  it('returns 404 when tenant not found', async () => {
    vi.mocked((await import('@/lib/api-tenant')).getTenantIdFromRequest).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/users/user-2'), ctx);
    expect(res.status).toBe(404);
  });
});
