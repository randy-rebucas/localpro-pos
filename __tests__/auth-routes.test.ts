// Env must be set before any imports
process.env.JWT_SECRET = 'test-secret-for-auth-routes-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateToken } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Hoisted mock stubs (must be declared before vi.mock factories run)
// ---------------------------------------------------------------------------

const {
  mockUserFindById,
  mockUserFindOne,
  mockUserFindByIdAndUpdate,
  mockTenantFindOne,
  mockMFAConfigFindOne,
  mockMFAConfigFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockUserFindById: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockUserFindByIdAndUpdate: vi.fn().mockResolvedValue(null),
  mockTenantFindOne: vi.fn(),
  mockMFAConfigFindOne: vi.fn(),
  mockMFAConfigFindOneAndUpdate: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { LOGIN: 'LOGIN', LOGOUT: 'LOGOUT', UPDATE: 'UPDATE' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));

vi.mock('@/lib/auth-config', () => ({
  AUTH_COOKIE_MAX_AGE: 604800,
  RL: {
    login: { max: 10, windowMs: 900_000 },
    mfaLogin: { max: 10, windowMs: 900_000 },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
  revokeToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue('$2b$10$hashed'),
  },
}));

vi.mock('@/models/User', () => ({
  default: {
    findById: mockUserFindById,
    findOne: mockUserFindOne,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
  },
}));

vi.mock('@/models/Tenant', () => ({
  default: { findOne: mockTenantFindOne },
}));

vi.mock('@/models/MFAConfig', () => ({
  default: {
    findOne: mockMFAConfigFindOne,
    findOneAndUpdate: mockMFAConfigFindOneAndUpdate,
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/lib/totp', () => ({
  verifyTOTP: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/auth/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function makeAuthRequest(body: unknown, role = 'admin'): NextRequest {
  const token = generateToken({
    userId: 'user-123',
    tenantId: 'tenant-abc',
    email: 'admin@test.com',
    role,
  });
  return new NextRequest('http://localhost/api/auth/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `auth-token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

/** Stub a User.findById chain: .select().lean() → value */
function stubUserFindById(value: unknown) {
  mockUserFindById.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(value),
    }),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: true,
      resetAfterMs: 0,
    });
    ({ POST } = await import('@/app/api/auth/login/route'));
  });

  it('returns 400 when email or password is missing', async () => {
    const res = await POST(makeJsonRequest({ email: '', password: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await POST(makeJsonRequest({ email: 'not-an-email', password: 'pass', tenantSlug: 'default' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when tenant is not found', async () => {
    mockTenantFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(makeJsonRequest({ email: 'a@b.com', password: 'pass', tenantSlug: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('returns 401 when user is not found', async () => {
    mockTenantFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'tenant-1', slug: 'default', isActive: true }),
    });
    mockUserFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    const res = await POST(makeJsonRequest({ email: 'missing@b.com', password: 'pass', tenantSlug: 'default' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    // Must not reveal whether user exists
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 when password is wrong', async () => {
    mockTenantFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'tenant-1', slug: 'default', isActive: true }),
    });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'a@b.com',
        name: 'Alice',
        role: 'admin',
        isActive: true,
        password: '$2b$10$hashed',
      }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(false as never);
    const res = await POST(makeJsonRequest({ email: 'a@b.com', password: 'wrong', tenantSlug: 'default' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns mfaRequired when MFA is enabled for user', async () => {
    mockTenantFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'tenant-1', slug: 'default', isActive: true }),
    });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'mfa@b.com',
        name: 'MFA User',
        role: 'admin',
        isActive: true,
        password: '$2b$10$hashed',
      }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(true as never);
    mockMFAConfigFindOne.mockResolvedValue({ isEnabled: true });

    const res = await POST(makeJsonRequest({ email: 'mfa@b.com', password: 'correct', tenantSlug: 'default' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mfaRequired).toBe(true);
    expect(body.data.userId).toBeDefined();
    // No token should be in the body
    expect(body.data.token).toBeUndefined();
  });

  it('returns 200 and sets httpOnly cookie on successful login', async () => {
    mockTenantFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'tenant-1', slug: 'default', isActive: true }),
    });
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'a@b.com',
        name: 'Alice',
        role: 'admin',
        isActive: true,
        password: '$2b$10$hashed',
      }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(true as never);
    mockMFAConfigFindOne.mockResolvedValue(null); // no MFA

    const res = await POST(makeJsonRequest({ email: 'a@b.com', password: 'correct', tenantSlug: 'default' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('a@b.com');
    // Token must NOT be in the response body
    expect(body.data.token).toBeUndefined();
    // Cookie should be set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('auth-token');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: false,
      resetAfterMs: 60_000,
    });
    const res = await POST(makeJsonRequest({ email: 'a@b.com', password: 'x', tenantSlug: 'default' }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // getCurrentUser depends on token-blacklist; keep tokens valid
    vi.mocked((await import('@/lib/token-blacklist')).isTokenRevoked).mockResolvedValue(false);
    vi.mocked((await import('@/lib/token-blacklist')).isTokenIssuedBeforeRevocation).mockResolvedValue(false);
    stubUserFindById({ isActive: true, tenantId: 'tenant-abc' });
    ({ POST } = await import('@/app/api/auth/logout/route'));
  });

  it('returns 200 and clears the cookie on successful logout', async () => {
    const req = makeAuthRequest({});
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const setCookie = res.headers.get('set-cookie');
    // Cookie should be cleared (max-age=0 or empty)
    expect(setCookie).toBeTruthy();
  });

  it('calls revokeToken with the cookie token', async () => {
    const { revokeToken } = await import('@/lib/token-blacklist');
    const req = makeAuthRequest({});
    await POST(req);
    expect(revokeToken).toHaveBeenCalled();
  });

  it('returns 200 even when no auth token is present', async () => {
    const req = new NextRequest('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await POST(req);
    // Logout should not fail — user may already be logged out
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/pin/verify
// ---------------------------------------------------------------------------

describe('POST /api/auth/pin/verify', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: true,
      resetAfterMs: 0,
    });
    vi.mocked((await import('@/lib/token-blacklist')).isTokenRevoked).mockResolvedValue(false);
    vi.mocked((await import('@/lib/token-blacklist')).isTokenIssuedBeforeRevocation).mockResolvedValue(false);
    stubUserFindById({ isActive: true, tenantId: 'tenant-abc' });
    ({ POST } = await import('@/app/api/auth/pin/verify/route'));
  });

  it('returns 400 when credential is missing', async () => {
    const res = await POST(makeAuthRequest({ credential: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when no user session exists', async () => {
    const req = new NextRequest('http://localhost/api/auth/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: '1234' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 when user has a PIN and credential matches', async () => {
    // 1st call: getCurrentUser → needs .select().lean()
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-abc' }) }),
    });
    // 2nd call: route handler → .select() resolves directly
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ pin: '$2b$10$pinhash', password: '$2b$10$pwhash' }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(true as never);

    const res = await POST(makeAuthRequest({ credential: '1234' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.unlocked).toBe(true);
  });

  it('returns 401 when user has a PIN and credential does not match', async () => {
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-abc' }) }),
    });
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ pin: '$2b$10$pinhash', password: '$2b$10$pwhash' }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(false as never);

    const res = await POST(makeAuthRequest({ credential: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('falls back to password when no PIN is set and credential matches', async () => {
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-abc' }) }),
    });
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ pin: null, password: '$2b$10$pwhash' }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(true as never);

    const res = await POST(makeAuthRequest({ credential: 'MyPassword1!' }));
    expect(res.status).toBe(200);
  });

  it('returns 401 when no PIN is set and password does not match', async () => {
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-abc' }) }),
    });
    mockUserFindById.mockReturnValueOnce({
      select: vi.fn().mockResolvedValue({ pin: null, password: '$2b$10$pwhash' }),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(false as never);

    const res = await POST(makeAuthRequest({ credential: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: false,
      resetAfterMs: 900_000,
    });
    const res = await POST(makeAuthRequest({ credential: '1234' }));
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/mfa/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/mfa/login', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  const mockUser = {
    _id: 'user-mfa-1',
    email: 'mfa@test.com',
    name: 'MFA User',
    role: 'admin',
    isActive: true,
    tenantId: 'tenant-abc',
  };

  const mockMFAConfig = {
    _id: 'mfa-config-1',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    backupCodes: ['$2b$10$backup1hash', '$2b$10$backup2hash'],
    lastUsedCounter: null,
    isEnabled: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: true,
      resetAfterMs: 0,
    });
    ({ POST } = await import('@/app/api/auth/mfa/login/route'));
  });

  it('returns 400 when userId or code is missing', async () => {
    const res = await POST(makeJsonRequest({ userId: '', code: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when user is not found', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await POST(makeJsonRequest({ userId: 'nonexistent', code: '123456' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when MFA is not configured for user', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: '123456' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid TOTP code', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(mockMFAConfig),
    });
    vi.mocked((await import('@/lib/totp')).verifyTOTP).mockReturnValue({ valid: false, counter: 0 });

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: '000000' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid mfa code/i);
  });

  it('returns 200 and sets cookie on valid TOTP code', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockMFAConfig, lastUsedCounter: null }),
    });
    vi.mocked((await import('@/lib/totp')).verifyTOTP).mockReturnValue({ valid: true, counter: 5 });

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: '123456' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe('mfa@test.com');
    expect(body.data.token).toBeUndefined(); // token must not be in body
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('auth-token');
    expect(setCookie).toContain('HttpOnly');
  });

  it('returns 401 for TOTP replay attack (same counter reused)', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockMFAConfig, lastUsedCounter: 5 }),
    });
    // Same counter as lastUsedCounter → replay
    vi.mocked((await import('@/lib/totp')).verifyTOTP).mockReturnValue({ valid: true, counter: 5 });

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: '123456' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/already used/i);
  });

  it('returns 200 and consumes backup code on valid backup code', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(mockMFAConfig),
    });
    // Backup code comparison: first code matches
    vi.mocked((await import('bcryptjs')).default.compare)
      .mockResolvedValueOnce(true as never)  // first backup code matches
      .mockResolvedValueOnce(false as never); // second doesn't matter
    // Atomic pull succeeds → updated is non-null
    mockMFAConfigFindOneAndUpdate.mockResolvedValue({ _id: 'mfa-config-1' });

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: 'ABCD-1234', isBackupCode: true }));
    expect(res.status).toBe(200);
    expect(mockMFAConfigFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ backupCodes: '$2b$10$backup1hash' }),
      { $pull: { backupCodes: '$2b$10$backup1hash' } },
      { new: false }
    );
  });

  it('returns 401 when backup code does not match any stored hash', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(mockMFAConfig),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValue(false as never);

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: 'WRONG-CODE', isBackupCode: true }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when backup code hash matches but atomic pull fails (concurrent use)', async () => {
    mockUserFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockUser) });
    mockMFAConfigFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue(mockMFAConfig),
    });
    vi.mocked((await import('bcryptjs')).default.compare).mockResolvedValueOnce(true as never);
    // Atomic pull returns null → another request already consumed the code
    mockMFAConfigFindOneAndUpdate.mockResolvedValue(null);

    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: 'ABCD-1234', isBackupCode: true }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked((await import('@/lib/rate-limit')).checkRateLimit).mockReturnValue({
      allowed: false,
      resetAfterMs: 900_000,
    });
    const res = await POST(makeJsonRequest({ userId: 'user-mfa-1', code: '123456' }));
    expect(res.status).toBe(429);
  });
});
