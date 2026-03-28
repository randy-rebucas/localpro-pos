/**
 * Section 3 — User Management
 * Tests: 3.1 – 3.6
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
vi.mock('@/lib/error-handler', () => ({
  handleApiError: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ success: false, error: 'error' }), { status: 500 })
  ),
}));
vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));
vi.mock('@/lib/token-blacklist', () => ({
  revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/api-tenant', () => ({
  requireTenantAccess: vi.fn(),
  getTenantIdFromRequest: vi.fn(),
}));

vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock('@/lib/subscription', () => ({
  checkSubscriptionLimit: vi.fn().mockResolvedValue(undefined),
  SubscriptionService: { updateUsage: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/models/User', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    create: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { requireRole } from '@/lib/auth';
import { requireTenantAccess, getTenantIdFromRequest } from '@/lib/api-tenant';
import { validateEmail, validatePassword } from '@/lib/validation';
import { checkSubscriptionLimit, SubscriptionService } from '@/lib/subscription';
import { revokeAllUserTokens } from '@/lib/token-blacklist';
import User from '@/models/User';

// ── Fixtures ───────────────────────────────────────────────────────────────
const TENANT_ID = 'tenant123';
const OTHER_TENANT_ID = 'other_tenant456';
const USER_ID = 'user_abc';

const mockAdminUser = {
  userId: 'admin_user',
  tenantId: TENANT_ID,
  email: 'admin@demo.com',
  role: 'admin',
};

const mockUserRecord = {
  _id: USER_ID,
  name: 'Test User',
  email: 'user@demo.com',
  role: 'cashier',
  tenantId: TENANT_ID,
  isActive: true,
};

// Request helpers
function req(
  method: string,
  url: string,
  body?: object,
  token = 'Bearer valid-token'
): NextRequest {
  const init: RequestInit = { method, headers: { authorization: token } };
  if (body) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost'), init);
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

// ── 3.1  GET /api/users ────────────────────────────────────────────────────
describe('GET /api/users (3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: mockAdminUser,
    });
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockUserRecord]),
        }),
      }),
    } as any);
  });

  it('returns only users for the authenticated tenant', async () => {
    const { GET } = await import('@/app/api/users/route');
    const res = await GET(req('GET', '/api/users'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    // Ensure User.find was called with the JWT-derived tenantId
    expect(vi.mocked(User.find)).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { GET } = await import('@/app/api/users/route');
    const res = await GET(req('GET', '/api/users', undefined, ''));

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is insufficient (cashier)', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { ...mockAdminUser, role: 'cashier' },
    });
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { GET } = await import('@/app/api/users/route');
    const res = await GET(req('GET', '/api/users'));

    expect(res.status).toBe(403);
  });
});

// ── 3.2  POST /api/users ───────────────────────────────────────────────────
describe('POST /api/users (3.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: mockAdminUser,
    });
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(validateEmail).mockReturnValue(true);
    vi.mocked(validatePassword).mockReturnValue({ valid: true, errors: [] });
    vi.mocked(checkSubscriptionLimit).mockResolvedValue(undefined);
    vi.mocked(User.countDocuments).mockResolvedValue(3 as any);
    vi.mocked(SubscriptionService.updateUsage).mockResolvedValue(undefined);

    const createdUser = {
      ...mockUserRecord,
      _id: 'new_user_id',
      role: 'cashier',
      toObject: vi.fn().mockReturnValue({ ...mockUserRecord, password: 'hashed' }),
    };
    vi.mocked(User.create).mockResolvedValue(createdUser as any);
  });

  it('creates a user with valid role and returns 201', async () => {
    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'new@demo.com',
        password: 'SecurePass1!',
        name: 'New User',
        role: 'cashier',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    // password must not be in the response
    expect(body.data?.password).toBeUndefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', { email: 'a@b.com' }) // missing password and name
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid email format', async () => {
    vi.mocked(validateEmail).mockReturnValue(false);

    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'not-an-email',
        password: 'SecurePass1!',
        name: 'User',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid role', async () => {
    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'u@demo.com',
        password: 'SecurePass1!',
        name: 'User',
        role: 'superuser', // invalid
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireTenantAccess).mockRejectedValue(
      new Error('Unauthorized: Authentication required')
    );

    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'u@demo.com',
        password: 'SecurePass1!',
        name: 'User',
      }, '')
    );

    expect(res.status).toBe(401);
  });

  it('returns 400 for duplicate email (code 11000)', async () => {
    const dupErr = Object.assign(new Error('duplicate key'), { code: 11000 });
    vi.mocked(User.create).mockRejectedValue(dupErr);

    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'existing@demo.com',
        password: 'SecurePass1!',
        name: 'Dup',
      })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already exists/i);
  });
});

// ── 3.3  PUT /api/users/[id] ──────────────────────────────────────────────
describe('PUT /api/users/[id] (3.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(validateEmail).mockReturnValue(true);
    vi.mocked(validatePassword).mockReturnValue({ valid: true, errors: [] });
    vi.mocked(revokeAllUserTokens).mockResolvedValue(undefined);

    // findOne for oldUser (no select)
    vi.mocked(User.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUserRecord),
    } as any);

    // findOneAndUpdate returns document
    vi.mocked(User.findOneAndUpdate).mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUserRecord, name: 'Updated Name' }),
    } as any);
  });

  it('updates user name and returns updated user', async () => {
    const { PUT } = await import('@/app/api/users/[id]/route');
    const res = await PUT(
      req('PUT', `/api/users/${USER_ID}`, { name: 'Updated Name' }),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
  });

  it('updates user role', async () => {
    vi.mocked(User.findOneAndUpdate).mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUserRecord, role: 'manager' }),
    } as any);

    const { PUT } = await import('@/app/api/users/[id]/route');
    const res = await PUT(
      req('PUT', `/api/users/${USER_ID}`, { role: 'manager' }),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.role).toBe('manager');
  });

  it('returns 400 for invalid role', async () => {
    const { PUT } = await import('@/app/api/users/[id]/route');
    const res = await PUT(
      req('PUT', `/api/users/${USER_ID}`, { role: 'superuser' }),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { PUT } = await import('@/app/api/users/[id]/route');
    const res = await PUT(
      req('PUT', `/api/users/nonexistent`, { name: 'x' }),
      idParams('nonexistent')
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('revokes tokens when password is updated', async () => {
    const { PUT } = await import('@/app/api/users/[id]/route');
    await PUT(
      req('PUT', `/api/users/${USER_ID}`, { password: 'NewPass1!' }),
      idParams(USER_ID)
    );

    expect(vi.mocked(revokeAllUserTokens)).toHaveBeenCalledWith(USER_ID);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { PUT } = await import('@/app/api/users/[id]/route');
    const res = await PUT(
      req('PUT', `/api/users/${USER_ID}`, { name: 'x' }, ''),
      idParams(USER_ID)
    );

    expect(res.status).toBe(401);
  });
});

// ── 3.4  DELETE /api/users/[id] ───────────────────────────────────────────
describe('DELETE /api/users/[id] (3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);

    vi.mocked(User.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUserRecord),
    } as any);
    vi.mocked(User.findOneAndDelete).mockResolvedValue(mockUserRecord as any);
  });

  it('deletes user and returns success', async () => {
    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/${USER_ID}`),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(vi.mocked(User.findOneAndDelete)).toHaveBeenCalledWith({
      _id: USER_ID,
      tenantId: TENANT_ID,
    });
  });

  it('returns 404 when user not found', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/ghost`),
      idParams('ghost')
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('returns 403 for manager role (DELETE requires admin only)', async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/${USER_ID}`),
      idParams(USER_ID)
    );

    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/${USER_ID}`, undefined, ''),
      idParams(USER_ID)
    );

    expect(res.status).toBe(401);
  });
});

// ── 3.5  Tenant isolation ─────────────────────────────────────────────────
describe('Tenant isolation — users from another tenant are not accessible (3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
  });

  it('GET /api/users only returns users matching JWT tenantId', async () => {
    // JWT tenantId = TENANT_ID; User.find called with that tenantId
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: mockAdminUser,
    });
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([mockUserRecord]),
        }),
      }),
    } as any);

    const { GET } = await import('@/app/api/users/route');
    await GET(req('GET', '/api/users'));

    // Must filter by the JWT-derived tenantId, not any client value
    expect(vi.mocked(User.find)).toHaveBeenCalledWith({ tenantId: TENANT_ID });
    expect(vi.mocked(User.find)).not.toHaveBeenCalledWith({ tenantId: OTHER_TENANT_ID });
  });

  it('GET /api/users/[id] returns 404 when user belongs to a different tenant', async () => {
    // getTenantIdFromRequest returns TENANT_ID from JWT
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    // User.findOne with { _id, tenantId: TENANT_ID } returns null (user is in OTHER_TENANT)
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as any);

    const { GET } = await import('@/app/api/users/[id]/route');
    const res = await GET(
      req('GET', `/api/users/${USER_ID}`),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('DELETE /api/users/[id] returns 404 when user belongs to a different tenant', async () => {
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);
    vi.mocked(User.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as any);

    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/${USER_ID}`),
      idParams(USER_ID)
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ── 3.6  Role hierarchy enforcement ──────────────────────────────────────
describe('Role hierarchy — cashier cannot manage users (3.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cashier cannot list users (GET /api/users returns 403)', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { ...mockAdminUser, role: 'cashier' },
    });
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { GET } = await import('@/app/api/users/route');
    const res = await GET(req('GET', '/api/users'));

    expect(res.status).toBe(403);
  });

  it('cashier cannot create users (POST /api/users returns 403)', async () => {
    vi.mocked(requireTenantAccess).mockResolvedValue({
      tenantId: TENANT_ID,
      user: { ...mockAdminUser, role: 'cashier' },
    });
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );

    const { POST } = await import('@/app/api/users/route');
    const res = await POST(
      req('POST', '/api/users', {
        email: 'x@demo.com',
        password: 'Pass1!',
        name: 'X',
      })
    );

    expect(res.status).toBe(403);
  });

  it('manager cannot delete users (DELETE /api/users/[id] requires admin)', async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new Error('Forbidden: Insufficient permissions')
    );
    vi.mocked(getTenantIdFromRequest).mockResolvedValue(TENANT_ID);

    const { DELETE } = await import('@/app/api/users/[id]/route');
    const res = await DELETE(
      req('DELETE', `/api/users/${USER_ID}`),
      idParams(USER_ID)
    );

    expect(res.status).toBe(403);
  });
});
