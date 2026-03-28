/**
 * Authentication API Route Tests
 * Covers checklist items 1.1 – 1.18
 */

process.env.JWT_SECRET = 'test-secret-for-unit-tests-only-32chars!!';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditActions: { LOGIN: 'login', LOGOUT: 'logout', UPDATE: 'update' },
}));

vi.mock('@/lib/validation-translations', () => ({
  getValidationTranslatorFromRequest: vi.fn().mockResolvedValue(
    (_key: string, fallback: string) => fallback
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, resetAfterMs: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/validation', () => ({
  validateEmail: vi.fn().mockReturnValue(true),
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  generateToken: vi.fn().mockReturnValue('mock-jwt-token'),
}));

vi.mock('@/lib/token-blacklist', () => ({
  revokeToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth-customer', () => ({
  generateCustomerToken: vi.fn().mockReturnValue('mock-customer-jwt-token'),
}));

vi.mock('@/lib/notifications', () => ({
  sendSMS: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/api-tenant', () => ({
  getTenantIdFromRequest: vi.fn().mockResolvedValue('tenant123'),
}));

vi.mock('@/models/User', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/models/Tenant', () => ({
  default: {
    findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    }),
  },
}));

vi.mock('@/models/CustomerOTP', () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ _id: 'otp123' }),
  },
}));

vi.mock('@/models/Customer', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
  compare: vi.fn().mockResolvedValue(true),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import { checkRateLimit } from '@/lib/rate-limit';
import { getCurrentUser, requireAuth } from '@/lib/auth';
import User from '@/models/User';
import Tenant from '@/models/Tenant';
import CustomerOTP from '@/models/CustomerOTP';
import Customer from '@/models/Customer';
import bcrypt from 'bcryptjs';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const mockTenant = { _id: 'tenant123', slug: 'demo', isActive: true, name: 'Demo Store' };

const mockUser = {
  _id: 'user123',
  email: 'staff@example.com',
  name: 'Staff User',
  role: 'admin',
  isActive: true,
  password: '$2b$10$hashedpassword',
  qrToken: 'mock-qr-token-abc123',
};

const mockSuperAdmin = {
  _id: 'sa001',
  email: 'superadmin@example.com',
  name: 'Super Admin',
  role: 'super_admin',
  isActive: true,
  password: '$2b$10$hashedpassword',
};

// Helper: build a POST NextRequest with a JSON body
function postReq(url: string, body: object, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Helper: build a GET NextRequest (optionally with auth cookie)
function getReq(url: string, token?: string) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'GET',
    headers: token ? { Cookie: `auth-token=${token}` } : {},
  });
}

// Helper: build a PUT NextRequest with a JSON body
function putReq(url: string, body: object, token?: string) {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Cookie: `auth-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// ── 1.1 – 1.3  POST /api/auth/login ─────────────────────────────────────────
describe('POST /api/auth/login — Staff Login / Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(mockUser),
    } as any);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
  });

  it('1.1 — valid credentials: returns success, sets httpOnly auth-token cookie', async () => {
    const { POST } = await import('@/app/api/auth/login/route');
    const req = postReq('http://localhost/api/auth/login', {
      email: 'staff@example.com',
      password: 'Password1!',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(mockUser.email);
    // Token must NOT be in body (XSS prevention)
    expect(body.data.token).toBeUndefined();
    // Cookie must be set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/auth-token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('1.2 — invalid password: returns 401 with generic error', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const { POST } = await import('@/app/api/auth/login/route');
    const req = postReq('http://localhost/api/auth/login', {
      email: 'staff@example.com',
      password: 'WrongPass',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    // Must not reveal whether user exists in another tenant
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('1.2 — unknown user: returns 401 with generic error', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as any);
    const { POST } = await import('@/app/api/auth/login/route');
    const req = postReq('http://localhost/api/auth/login', {
      email: 'nobody@example.com',
      password: 'anything',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('1.2 — inactive tenant: returns 404', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) } as any);
    const { POST } = await import('@/app/api/auth/login/route');
    const req = postReq('http://localhost/api/auth/login', {
      email: 'staff@example.com',
      password: 'Password1!',
      tenantSlug: 'nonexistent',
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('1.3 — rate limit exceeded: returns 429', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 900000 });
    const { POST } = await import('@/app/api/auth/login/route');
    const req = postReq('http://localhost/api/auth/login', {
      email: 'staff@example.com',
      password: 'Password1!',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
    expect(res.headers.get('Retry-After')).toBe('900');
  });
});

// ── 1.4  POST /api/auth/logout ───────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
  });

  it('1.4 — logout blacklists the token and clears the cookie', async () => {
    const { revokeToken } = await import('@/lib/token-blacklist');
    const { POST } = await import('@/app/api/auth/logout/route');

    const req = new NextRequest(new URL('http://localhost/api/auth/logout'), {
      method: 'POST',
      headers: { Cookie: 'auth-token=valid-token-xyz' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Token must have been revoked
    expect(revokeToken).toHaveBeenCalledWith('valid-token-xyz', 7 * 86400, 'logout');
    // Cookie must be deleted
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/auth-token=;/i);
  });
});

// ── 1.5 – 1.6  GET /api/auth/me ─────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUser),
      }),
    } as any);
  });

  it('1.5 — authenticated request returns current user (no password field)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);

    const { GET } = await import('@/app/api/auth/me/route');
    const req = getReq('http://localhost/api/auth/me', 'valid-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(mockUser.email);
    expect(body.user.password).toBeUndefined();
  });

  it('1.6 — present but invalid token returns 401', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/auth/me/route');
    // Token is present but getCurrentUser returns null (expired/tampered)
    const req = getReq('http://localhost/api/auth/me', 'invalid-or-expired-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('1.6 — no token returns 200 with user: null (unauthenticated visitor)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/auth/me/route');
    const req = getReq('http://localhost/api/auth/me'); // no cookie

    const res = await GET(req);
    const body = await res.json();

    // No token at all → not an error, just no user
    expect(res.status).toBe(200);
    expect(body.user).toBeNull();
  });
});

// ── 1.7 – 1.8  QR Code Login ────────────────────────────────────────────────
describe('QR Code Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1.7 — POST /api/auth/qr-code generates a QR token for authenticated user', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/qr-code/route');
    const req = new NextRequest(new URL('http://localhost/api/auth/qr-code'), {
      method: 'POST',
      headers: { Cookie: 'auth-token=valid-token' },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(typeof body.data.qrToken).toBe('string');
    expect(body.data.qrToken.length).toBeGreaterThan(0);
  });

  it('1.7 — unauthenticated request to qr-code returns 401', async () => {
    vi.mocked(requireAuth).mockRejectedValue(Object.assign(new Error('Unauthorized'), {}));

    const { POST } = await import('@/app/api/auth/qr-code/route');
    const req = new NextRequest(new URL('http://localhost/api/auth/qr-code'), {
      method: 'POST',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('1.8 — POST /api/auth/login-qr authenticates with valid QR token', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(User.findOne).mockResolvedValue({ ...mockUser });
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/login-qr/route');
    const req = postReq('http://localhost/api/auth/login-qr', {
      qrToken: 'mock-qr-token-abc123',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.email).toBe(mockUser.email);
    // Auth cookie must be set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/auth-token=/);
  });

  it('1.8 — invalid QR token returns 401', async () => {
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
    vi.mocked(User.findOne).mockResolvedValue(null); // no user found for this QR token

    const { POST } = await import('@/app/api/auth/login-qr/route');
    const req = postReq('http://localhost/api/auth/login-qr', {
      qrToken: 'bad-qr-token',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });
});

// ── 1.9  GET /api/auth/qr-code (current user's QR token) ────────────────────
describe('GET /api/auth/qr-code — current user QR token', () => {
  it('1.9 — returns existing QR token for authenticated user', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue(mockUser),
    } as any);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

    const { GET } = await import('@/app/api/auth/qr-code/route');
    const req = getReq('http://localhost/api/auth/qr-code', 'valid-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.qrToken).toBe(mockUser.qrToken);
    expect(body.data.email).toBe(mockUser.email);
  });

  it('1.9 — generates a new QR token if user has none', async () => {
    const userWithoutQr = { ...mockUser, qrToken: undefined };
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue(userWithoutQr),
    } as any);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

    const { GET } = await import('@/app/api/auth/qr-code/route');
    const req = getReq('http://localhost/api/auth/qr-code', 'valid-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // A new token should have been generated and returned
    expect(typeof body.data.qrToken).toBe('string');
    expect(body.data.qrToken.length).toBeGreaterThan(0);
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
  });
});

// ── 1.10  POST /api/auth/change-password ────────────────────────────────────
describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUser, save: vi.fn().mockResolvedValue(undefined) }),
    } as any);
  });

  it('1.10 — valid current password: updates password and returns success', async () => {
    // First compare: current password valid → true
    // Second compare: new password != current → false (proceed)
    vi.mocked(bcrypt.compare)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(false as never);
    const { POST } = await import('@/app/api/auth/change-password/route');
    const req = postReq(
      'http://localhost/api/auth/change-password',
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      { Cookie: 'auth-token=valid-token' }
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('1.10 — wrong current password returns 401', async () => {
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    const { POST } = await import('@/app/api/auth/change-password/route');
    const req = postReq(
      'http://localhost/api/auth/change-password',
      { currentPassword: 'WrongOld!', newPassword: 'NewPass1!' },
      { Cookie: 'auth-token=valid-token' }
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('1.10 — same password as current returns 400', async () => {
    // First compare (current password check) → true, second (same password check) → true
    vi.mocked(bcrypt.compare)
      .mockResolvedValueOnce(true as never)
      .mockResolvedValueOnce(true as never);

    const { POST } = await import('@/app/api/auth/change-password/route');
    const req = postReq(
      'http://localhost/api/auth/change-password',
      { currentPassword: 'SamePass1!', newPassword: 'SamePass1!' },
      { Cookie: 'auth-token=valid-token' }
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/must be different/i);
  });

  it('1.10 — unauthenticated request returns 401', async () => {
    vi.mocked(requireAuth).mockRejectedValue(Object.assign(new Error('Unauthorized'), {}));
    const { POST } = await import('@/app/api/auth/change-password/route');
    const req = postReq(
      'http://localhost/api/auth/change-password',
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' }
    );

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});

// ── 1.11  POST /api/auth/reset-password ─────────────────────────────────────
describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
  });

  it('1.11 — authenticated mode: changes password with valid currentPassword', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUser, save: vi.fn().mockResolvedValue(undefined) }),
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const { POST } = await import('@/app/api/auth/reset-password/route');
    const req = postReq(
      'http://localhost/api/auth/reset-password',
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      { Cookie: 'auth-token=valid-token' }
    );

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('1.11 — token-based mode: rejects invalid reset token with 400', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null); // unauthenticated
    vi.mocked(Tenant.findOne).mockResolvedValue(mockTenant);
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue({
        ...mockUser,
        resetToken: '$2b$10$hashedresettoken',
        resetTokenExpiry: new Date(Date.now() + 60000),
      }),
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never); // wrong token

    const { POST } = await import('@/app/api/auth/reset-password/route');
    const req = postReq('http://localhost/api/auth/reset-password', {
      email: 'staff@example.com',
      tenantId: 'demo',
      resetToken: 'wrong-token',
      newPassword: 'NewPass1!',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('1.11 — rate limit exceeded returns 429', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 900000 });

    const { POST } = await import('@/app/api/auth/reset-password/route');
    const req = postReq('http://localhost/api/auth/reset-password', {
      email: 'staff@example.com',
      tenantId: 'demo',
      resetToken: 'sometoken',
      newPassword: 'NewPass1!',
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });
});

// ── 1.12  PUT /api/auth/profile ──────────────────────────────────────────────
describe('PUT /api/auth/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUser),
    } as any);
    vi.mocked(User.findByIdAndUpdate).mockReturnValue({
      select: vi.fn().mockResolvedValue(mockUser),
    } as any);
  });

  it('1.12 — updates name successfully', async () => {
    const { PUT } = await import('@/app/api/auth/profile/route');
    const req = putReq(
      'http://localhost/api/auth/profile',
      { name: 'Updated Name' },
      'valid-token'
    );

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('1.12 — unauthenticated request returns 401', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { PUT } = await import('@/app/api/auth/profile/route');
    const req = putReq('http://localhost/api/auth/profile', { name: 'Hacker' });

    const res = await PUT(req);

    expect(res.status).toBe(401);
  });

  it('1.12 — empty body with no changes returns 400', async () => {
    const { PUT } = await import('@/app/api/auth/profile/route');
    const req = putReq(
      'http://localhost/api/auth/profile',
      {}, // no fields
      'valid-token'
    );

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/no changes/i);
  });
});

// ── 1.13 – 1.15  Customer OTP Auth ──────────────────────────────────────────
describe('Customer OTP Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
    vi.mocked(Tenant.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockTenant) } as any);
  });

  it('1.13 — POST /api/auth/customer/send-otp succeeds for valid phone', async () => {
    vi.mocked(CustomerOTP.findOne).mockResolvedValue(null); // no recent OTP
    vi.mocked(CustomerOTP.updateMany).mockResolvedValue(null as any);
    vi.mocked(CustomerOTP.create).mockResolvedValue({ _id: 'otp123' } as any);

    const { POST } = await import('@/app/api/auth/customer/send-otp/route');
    const req = postReq('http://localhost/api/auth/customer/send-otp', {
      phone: '09171234567',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // OTP must NOT be in the response body
    expect(body.otp).toBeUndefined();
  });

  it('1.13 — rate limit: 5 OTP requests per 10 min returns 429', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 600000 });

    const { POST } = await import('@/app/api/auth/customer/send-otp/route');
    const req = postReq('http://localhost/api/auth/customer/send-otp', {
      phone: '09171234567',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('1.13 — duplicate OTP within 1 minute returns 429', async () => {
    vi.mocked(CustomerOTP.findOne).mockResolvedValue({ _id: 'existing-otp' } as any);

    const { POST } = await import('@/app/api/auth/customer/send-otp/route');
    const req = postReq('http://localhost/api/auth/customer/send-otp', {
      phone: '09171234567',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.retryAfter).toBe(60);
  });

  it('1.14 — POST /api/auth/customer/verify-otp: correct OTP logs in existing customer', async () => {
    const mockOtpRecord = {
      _id: 'otp123',
      otp: '123456',
      attempts: 0,
      verified: false,
      save: vi.fn().mockResolvedValue(undefined),
    };
    const mockCustomer = {
      _id: 'cust123',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '09171234567',
      email: 'jane@example.com',
      isActive: true,
    };

    vi.mocked(CustomerOTP.findOne).mockResolvedValue(mockOtpRecord as any);
    vi.mocked(Customer.findOne).mockResolvedValue(mockCustomer as any);

    const { POST } = await import('@/app/api/auth/customer/verify-otp/route');
    const req = postReq('http://localhost/api/auth/customer/verify-otp', {
      phone: '09171234567',
      otp: '123456',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.customer.firstName).toBe('Jane');
    // customer-auth-token cookie set
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/customer-auth-token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('1.15 — incorrect OTP returns 401', async () => {
    vi.mocked(CustomerOTP.findOne).mockResolvedValue(null); // no matching OTP record
    vi.mocked(CustomerOTP.updateOne).mockResolvedValue(null as any);

    const { POST } = await import('@/app/api/auth/customer/verify-otp/route');
    const req = postReq('http://localhost/api/auth/customer/verify-otp', {
      phone: '09171234567',
      otp: '000000',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/invalid or expired otp/i);
  });

  it('1.15 — OTP with 5+ attempts returns 429', async () => {
    const exhaustedOtp = {
      _id: 'otp123',
      otp: '123456',
      attempts: 5,
      verified: false,
      save: vi.fn(),
    };
    vi.mocked(CustomerOTP.findOne).mockResolvedValue(exhaustedOtp as any);

    const { POST } = await import('@/app/api/auth/customer/verify-otp/route');
    const req = postReq('http://localhost/api/auth/customer/verify-otp', {
      phone: '09171234567',
      otp: '123456',
      tenantSlug: 'demo',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.success).toBe(false);
  });

  it('1.15 — new customer OTP verify: requires firstName and lastName', async () => {
    const mockOtpRecord = {
      _id: 'otp123',
      otp: '123456',
      attempts: 0,
      verified: false,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(CustomerOTP.findOne).mockResolvedValue(mockOtpRecord as any);
    vi.mocked(Customer.findOne).mockResolvedValue(null); // new customer

    const { POST } = await import('@/app/api/auth/customer/verify-otp/route');
    const req = postReq('http://localhost/api/auth/customer/verify-otp', {
      phone: '09171234567',
      otp: '123456',
      tenantSlug: 'demo',
      // no firstName/lastName
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ── 1.16 – 1.18  Super Admin Auth ───────────────────────────────────────────
describe('Super Admin Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, resetAfterMs: 0 });
  });

  it('1.16 — valid credentials grant super admin access and set cookie', async () => {
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(mockSuperAdmin),
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(User.findByIdAndUpdate).mockResolvedValue(null);

    const { POST } = await import('@/app/api/super-admin/auth/login/route');
    const req = postReq('http://localhost/api/super-admin/auth/login', {
      email: 'superadmin@example.com',
      password: 'SuperPass1!',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.user.role).toBe('super_admin');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/auth-token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it('1.16 — regular user trying super admin login returns 401', async () => {
    // No super_admin user found for this email
    vi.mocked(User.findOne).mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
    } as any);

    const { POST } = await import('@/app/api/super-admin/auth/login/route');
    const req = postReq('http://localhost/api/super-admin/auth/login', {
      email: 'staff@example.com',
      password: 'anything',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('1.16 — rate limit on super admin login returns 429', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, resetAfterMs: 900000 });

    const { POST } = await import('@/app/api/super-admin/auth/login/route');
    const req = postReq('http://localhost/api/super-admin/auth/login', {
      email: 'superadmin@example.com',
      password: 'SuperPass1!',
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('1.17 — GET /api/super-admin/auth/me returns profile for super admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'sa001',
      tenantId: '',
      email: 'superadmin@example.com',
      role: 'super_admin',
    } as any);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockSuperAdmin),
      }),
    } as any);

    const { GET } = await import('@/app/api/super-admin/auth/me/route');
    const req = getReq('http://localhost/api/super-admin/auth/me', 'super-admin-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.user.role).toBe('super_admin');
  });

  it('1.18 — non-super-admin cannot access /api/super-admin/auth/me', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'user123',
      tenantId: 'tenant123',
      email: 'staff@example.com',
      role: 'admin', // regular admin, not super_admin
    } as any);

    const { GET } = await import('@/app/api/super-admin/auth/me/route');
    const req = getReq('http://localhost/api/super-admin/auth/me', 'regular-user-token');

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/unauthorized/i);
  });

  it('1.18 — unauthenticated request to super admin routes returns 401', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const { GET } = await import('@/app/api/super-admin/auth/me/route');
    const req = getReq('http://localhost/api/super-admin/auth/me');

    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});
