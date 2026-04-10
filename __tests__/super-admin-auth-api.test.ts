import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const {
  mockConnectDB,
  mockGetCurrentUser,
  mockGenerateToken,
  mockCheckRateLimit,
  mockGetClientIp,
  mockHandleApiError,
  mockUserFindOne,
  mockUserFindById,
  mockUserFindByIdAndUpdate,
  mockBcryptCompare,
} = vi.hoisted(() => ({
  mockConnectDB: vi.fn(),
  mockGetCurrentUser: vi.fn(),
  mockGenerateToken: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserFindByIdAndUpdate: vi.fn(),
  mockBcryptCompare: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({ default: mockConnectDB }));
vi.mock('@/lib/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
  generateToken: mockGenerateToken,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  getClientIp: mockGetClientIp,
}));
vi.mock('@/lib/error-handler', () => ({ handleApiError: mockHandleApiError }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/models/User', () => ({
  default: {
    findOne: mockUserFindOne,
    findById: mockUserFindById,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
  },
}));
vi.mock('bcryptjs', () => ({
  default: { compare: mockBcryptCompare },
}));

import { POST as loginPOST } from '@/app/api/super-admin/auth/login/route';
import { GET as meGET } from '@/app/api/super-admin/auth/me/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePostReq(body: unknown, url = 'http://localhost/api/super-admin/auth/login') {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeGetReq(url: string) {
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// POST /api/super-admin/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/super-admin/auth/login', () => {
  const mockUser = {
    _id: 'sa1',
    email: 'admin@example.com',
    name: 'Super Admin',
    role: 'super_admin',
    isActive: true,
    password: 'hashed-password',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockGetClientIp.mockReturnValue('127.0.0.1');
    mockCheckRateLimit.mockReturnValue({ allowed: true, resetAfterMs: 0 });
    mockUserFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(mockUser) });
    mockUserFindByIdAndUpdate.mockResolvedValue(undefined);
    mockBcryptCompare.mockResolvedValue(true);
    mockGenerateToken.mockReturnValue('mock-jwt-token');
    mockHandleApiError.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    );
  });

  it('returns 200 with user data and sets auth-token cookie on success', async () => {
    const res = await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.user.email).toBe('admin@example.com');
    expect(data.data.user.role).toBe('super_admin');
    expect(res.headers.get('set-cookie')).toContain('auth-token');
  });

  it('generates token with empty tenantId for super_admin', async () => {
    await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));

    expect(mockGenerateToken).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: '', role: 'super_admin' })
    );
  });

  it('returns 400 when email is missing', async () => {
    const res = await loginPOST(makePostReq({ password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 when password is missing', async () => {
    const res = await loginPOST(makePostReq({ email: 'admin@example.com' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/required/i);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await loginPOST(makePostReq({ email: 'notanemail', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/email/i);
  });

  it('returns 429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, resetAfterMs: 60000 });

    const res = await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/too many/i);
  });

  it('returns 401 when user not found', async () => {
    mockUserFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

    const res = await loginPOST(makePostReq({ email: 'noone@example.com', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 when user is inactive', async () => {
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUser, isActive: false }),
    });

    const res = await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 when password is wrong', async () => {
    mockBcryptCompare.mockResolvedValue(false);

    const res = await loginPOST(makePostReq({ email: 'admin@example.com', password: 'wrongpass' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 when user has no password field', async () => {
    mockUserFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({ ...mockUser, password: undefined }),
    });

    const res = await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toMatch(/invalid credentials/i);
  });

  it('updates lastLogin on successful login', async () => {
    await loginPOST(makePostReq({ email: 'admin@example.com', password: 'secret' }));

    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(
      'sa1',
      { lastLogin: expect.any(Date) }
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/super-admin/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/super-admin/auth/me', () => {
  const mockUserDoc = {
    _id: 'sa1',
    email: 'admin@example.com',
    name: 'Super Admin',
    role: 'super_admin',
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockGetCurrentUser.mockResolvedValue({
      userId: 'sa1',
      tenantId: '',
      role: 'super_admin',
    });
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockUserDoc),
    });
  });

  it('returns 200 with user data for super_admin', async () => {
    const res = await meGET(makeGetReq('http://localhost/api/super-admin/auth/me'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.email).toBe('admin@example.com');
    expect(data.user.role).toBe('super_admin');
  });

  it('returns 401 when getCurrentUser returns null', async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await meGET(makeGetReq('http://localhost/api/super-admin/auth/me'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 when user is not super_admin role', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' });

    const res = await meGET(makeGetReq('http://localhost/api/super-admin/auth/me'));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 404 when user not found in DB', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    const res = await meGET(makeGetReq('http://localhost/api/super-admin/auth/me'));
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });
});
