process.env.JWT_SECRET = 'test-secret-32chars-authextend!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted stubs
// ---------------------------------------------------------------------------

const {
  mockGetCurrentUser,
  mockRequireAuth,
  mockUserFindById,
  mockUserFindByIdAndUpdate,
  mockUserFindOne,
  mockTenantFindById,
  mockTenantFindOne,
  mockBcryptCompare,
  mockBcryptHash,
  mockCheckRateLimit,
  mockGetClientIp,
  mockValidateEmail,
  mockValidatePassword,
  mockRevokeAllUserTokens,
  mockHandleApiError,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserFindByIdAndUpdate: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockTenantFindOne: vi.fn(),
  mockBcryptCompare: vi.fn(),
  mockBcryptHash: vi.fn(),
  mockCheckRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 }),
  mockGetClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  mockValidateEmail: vi.fn().mockReturnValue(true),
  mockValidatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
  mockRevokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
  mockHandleApiError: vi.fn().mockImplementation((_err: unknown, msg: string) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { UPDATE: 'UPDATE', LOGIN: 'LOGIN' },
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
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}));
vi.mock('@/lib/validation', () => ({
  validateEmail: mockValidateEmail,
  validatePassword: mockValidatePassword,
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/auth-config', () => ({
  AUTH_COOKIE_MAX_AGE: 604800,
  RL: { loginQr: { max: 5, windowMs: 900000 }, qrRegen: { max: 5, windowMs: 3600000 } },
}));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return { ...actual, getCurrentUser: mockGetCurrentUser, requireAuth: mockRequireAuth };
});
vi.mock('@/models/User', () => ({
  default: {
    findById: mockUserFindById,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
    findOne: mockUserFindOne,
  },
}));
vi.mock('@/models/Tenant', () => ({
  default: {
    findById: mockTenantFindById,
    findOne: mockTenantFindOne,
  },
}));
vi.mock('@/models/MFAConfig', () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
  },
}));
vi.mock('bcryptjs', () => ({
  default: { compare: mockBcryptCompare, hash: mockBcryptHash },
  compare: mockBcryptCompare,
  hash: mockBcryptHash,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const token = generateToken({ userId: 'user-1', tenantId: 'tenant-1', email: 'a@b.com', role: 'admin' });
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: `auth-token=${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Returns a Mongoose-like query that supports .select().lean() and direct await */
function makeChainQuery(value: unknown) {
  const chain: {
    select: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>;
    catch: (rej: (e: unknown) => unknown) => Promise<unknown>;
  } = {
    select: vi.fn().mockImplementation(() => makeChainQuery(value)),
    lean: vi.fn().mockResolvedValue(value),
    then: (res, rej) => Promise.resolve(value).then(res, rej),
    catch: (rej) => Promise.resolve(value).catch(rej),
  };
  return chain;
}

const currentUser = { userId: 'user-1', tenantId: 'tenant-1', email: 'test@example.com', role: 'admin' };

const mockUserData = {
  _id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  isActive: true,
  tenantId: 'tenant-1',
  qrToken: 'existing-qr-token',
  createdAt: new Date('2024-01-01'),
  lastLogin: new Date('2024-06-01'),
  password: '$2a$10$hashedpassword',
  pin: null,
  comparePassword: vi.fn().mockResolvedValue(true),
};

const mockTenantData = { _id: 'tenant-1', slug: 'demo', name: 'Demo Store' };

// ===========================================================================
// GET /api/auth/profile
// ===========================================================================

describe('GET /api/auth/profile', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockUserFindById.mockImplementation(() => makeChainQuery(mockUserData));
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    mockTenantFindById.mockImplementation(() => makeChainQuery(mockTenantData));
    ({ GET } = await import('@/app/api/auth/profile/route'));
  });

  it('returns 200 with user profile', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/profile'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('test@example.com');
    expect(body.user.tenantSlug).toBe('demo');
    expect(body.user.qrToken).toBe('existing-qr-token');
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/profile'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when user is inactive', async () => {
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData, isActive: false }));
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/profile'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/inactive/i);
  });

  it('generates a qrToken when missing and returns 200', async () => {
    const userWithoutQr = { ...mockUserData, qrToken: null };
    const userWithQr = { ...mockUserData, qrToken: 'new-generated-token' };
    mockUserFindById
      .mockImplementationOnce(() => makeChainQuery(userWithoutQr)) // first call: no qrToken
      .mockImplementationOnce(() => makeChainQuery(userWithQr));   // second call: after update
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/profile'));
    expect(res.status).toBe(200);
    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ qrToken: expect.any(String) })
    );
  });
});

// ===========================================================================
// PUT /api/auth/profile
// ===========================================================================

describe('PUT /api/auth/profile', () => {
  let PUT: (req: NextRequest) => Promise<Response>;

  const updatedUser = { ...mockUserData, name: 'Updated Name' };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockValidateEmail.mockReturnValue(true);
    mockValidatePassword.mockReturnValue({ valid: true, errors: [] });
    // oldUser lookup — .lean() directly on findById
    mockUserFindById.mockImplementation(() => makeChainQuery(mockUserData));
    // findByIdAndUpdate for profile save
    mockUserFindByIdAndUpdate.mockImplementation(() => makeChainQuery(updatedUser));
    ({ PUT } = await import('@/app/api/auth/profile/route'));
  });

  it('returns 200 on successful name update', async () => {
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', { name: 'Updated Name' })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
  });

  it('returns 400 when no changes provided', async () => {
    const res = await PUT(makeRequest('PUT', 'http://localhost/api/auth/profile', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no changes/i);
  });

  it('returns 400 when email format is invalid', async () => {
    mockValidateEmail.mockReturnValue(false);
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', { email: 'bad-email' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid email/i);
  });

  it('returns 400 when password change missing currentPassword', async () => {
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', { password: 'NewPass123!' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/current password is required/i);
  });

  it('returns 400 when currentPassword is incorrect', async () => {
    const docWithCompare = { ...mockUserData, comparePassword: vi.fn().mockResolvedValue(false) };
    // First findById for oldUser (lean), second for password doc (no lean)
    mockUserFindById
      .mockImplementationOnce(() => makeChainQuery(mockUserData))   // oldUser.lean()
      .mockImplementationOnce(() => makeChainQuery(docWithCompare)); // userDoc (with comparePassword)
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', {
        password: 'NewPass123!',
        currentPassword: 'wrong',
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/current password is incorrect/i);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', { name: 'x' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 on duplicate email (mongo 11000)', async () => {
    mockUserFindByIdAndUpdate.mockImplementation(() => {
      const err = Object.assign(new Error('duplicate'), { code: 11000 });
      return { select: () => { throw err; } };
    });
    const res = await PUT(
      makeRequest('PUT', 'http://localhost/api/auth/profile', { name: 'x', email: 'dup@test.com' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email already exists/i);
  });
});

// ===========================================================================
// GET /api/auth/pin
// ===========================================================================

describe('GET /api/auth/pin', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData, pin: null }));
    ({ GET } = await import('@/app/api/auth/pin/route'));
  });

  it('returns 200 with hasPinSet: false when no PIN', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/pin'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.hasPinSet).toBe(false);
  });

  it('returns 200 with hasPinSet: true when PIN is set', async () => {
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData, pin: '$2a$10$pinhash' }));
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/pin'));
    const body = await res.json();
    expect(body.data.hasPinSet).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/pin'));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/auth/pin
// ===========================================================================

describe('POST /api/auth/pin', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAfterMs: 0 });
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData }));
    mockBcryptCompare.mockResolvedValue(true);
    mockBcryptHash.mockResolvedValue('$2a$10$pinhash');
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    ({ POST } = await import('@/app/api/auth/pin/route'));
  });

  it('returns 200 on successful PIN set', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: '1234',
      currentPassword: 'Password123!',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/pin set/i);
  });

  it('returns 400 when PIN format is invalid (letters)', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: 'abcd',
      currentPassword: 'Password123!',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/4 to 6 digits/i);
  });

  it('returns 400 when PIN is too short', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: '123',
      currentPassword: 'Password123!',
    }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when PIN and currentPassword are missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it('returns 401 when current password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: '1234',
      currentPassword: 'wrong',
    }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 900000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: '1234',
      currentPassword: 'pass',
    }));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin', {
      pin: '1234',
      currentPassword: 'pass',
    }));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/auth/pin
// ===========================================================================

describe('DELETE /api/auth/pin', () => {
  let DELETE: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAfterMs: 0 });
    mockUserFindById.mockImplementation(() => makeChainQuery(mockUserData));
    mockBcryptCompare.mockResolvedValue(true);
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    ({ DELETE } = await import('@/app/api/auth/pin/route'));
  });

  it('returns 200 on successful PIN removal', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/auth/pin', {
      currentPassword: 'Password123!',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toMatch(/removed/i);
  });

  it('returns 400 when currentPassword is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/auth/pin', {}));
    expect(res.status).toBe(400);
  });

  it('returns 401 when current password is incorrect', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const res = await DELETE(makeRequest('DELETE', 'http://localhost/api/auth/pin', {
      currentPassword: 'wrong',
    }));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// POST /api/auth/pin/verify
// ===========================================================================

describe('POST /api/auth/pin/verify', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue(currentUser);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAfterMs: 0 });
    // User with PIN set
    mockUserFindById.mockImplementation(() => makeChainQuery({
      ...mockUserData,
      pin: '$2a$10$pinhash',
    }));
    mockBcryptCompare.mockResolvedValue(true);
    ({ POST } = await import('@/app/api/auth/pin/verify/route'));
  });

  it('returns 200 when PIN credential is correct', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {
      credential: '1234',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.unlocked).toBe(true);
  });

  it('returns 200 when password credential is correct (no PIN set)', async () => {
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData, pin: null }));
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {
      credential: 'Password123!',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unlocked).toBe(true);
  });

  it('returns 401 when credential is incorrect', async () => {
    mockBcryptCompare.mockResolvedValue(false);
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {
      credential: 'wrong',
    }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/incorrect/i);
  });

  it('returns 400 when credential is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {}));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 900000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {
      credential: '1234',
    }));
    expect(res.status).toBe(429);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/pin/verify', {
      credential: '1234',
    }));
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// GET /api/auth/qr-code
// ===========================================================================

describe('GET /api/auth/qr-code', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(currentUser);
    mockUserFindById.mockImplementation(() => makeChainQuery({
      ...mockUserData,
      qrToken: 'my-qr-token',
    }));
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    ({ GET } = await import('@/app/api/auth/qr-code/route'));
  });

  it('returns 200 with qrToken', async () => {
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.qrToken).toBe('my-qr-token');
    expect(body.data.name).toBe('Test User');
  });

  it('generates token if missing and returns 200', async () => {
    mockUserFindById.mockImplementation(() => makeChainQuery({ ...mockUserData, qrToken: null }));
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBe(200);
    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ qrToken: expect.any(String) })
    );
  });

  it('returns error when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await GET(makeRequest('GET', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ===========================================================================
// POST /api/auth/qr-code (regenerate)
// ===========================================================================

describe('POST /api/auth/qr-code', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue(currentUser);
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAfterMs: 0 });
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    ({ POST } = await import('@/app/api/auth/qr-code/route'));
  });

  it('returns 200 with new qrToken', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.qrToken).toBeDefined();
    expect(typeof body.data.qrToken).toBe('string');
    expect(body.data.qrToken).toHaveLength(64); // 32 random bytes as hex
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 3600000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBe(429);
  });

  it('returns error when unauthenticated', async () => {
    mockRequireAuth.mockRejectedValue(new Error('Unauthorized'));
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/qr-code'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ===========================================================================
// POST /api/auth/login-qr
// ===========================================================================

describe('POST /api/auth/login-qr', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const mockQrUser = {
    _id: { toString: () => 'user-1' },
    email: 'staff@demo.com',
    name: 'Staff Member',
    role: 'cashier',
    isActive: true,
    tenantId: { toString: () => 'tenant-1' },
  };

  const mockQrTenant = {
    _id: { toString: () => 'tenant-1' },
    slug: 'demo',
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 4, resetAfterMs: 0 });
    mockTenantFindOne.mockImplementation(() => makeChainQuery(mockQrTenant));
    mockUserFindOne.mockResolvedValue(mockQrUser);
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    ({ POST } = await import('@/app/api/auth/login-qr/route'));
  });

  it('returns 200 with user data and sets auth cookie', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/login-qr', {
      qrToken: 'valid-qr-token',
      tenantSlug: 'demo',
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('staff@demo.com');
    expect(res.headers.get('set-cookie')).toMatch(/auth-token/);
  });

  it('returns 400 when qrToken is missing', async () => {
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/login-qr', {
      tenantSlug: 'demo',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/qr token is required/i);
  });

  it('returns 404 when tenant not found', async () => {
    mockTenantFindOne.mockImplementation(() => makeChainQuery(null));
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/login-qr', {
      qrToken: 'token',
      tenantSlug: 'unknown',
    }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tenant not found/i);
  });

  it('returns 500 when user not found by qrToken', async () => {
    mockUserFindOne.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/login-qr', {
      qrToken: 'invalid-token',
      tenantSlug: 'demo',
    }));
    // Route creates audit log and returns 500 (falls through to error handler since user not found
    // is handled by an error throw, not explicit 404)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAfterMs: 900000 });
    const res = await POST(makeRequest('POST', 'http://localhost/api/auth/login-qr', {
      qrToken: 'token',
    }));
    expect(res.status).toBe(429);
  });
});
