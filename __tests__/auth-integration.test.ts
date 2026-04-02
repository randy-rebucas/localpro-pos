// Set env vars before any imports
process.env.JWT_SECRET = 'test-secret-for-integration-tests-32chars!!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateToken, verifyToken, getCurrentUser, hasRole } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock the token blacklist so we can control revocation per test
vi.mock('@/lib/token-blacklist', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
  isTokenIssuedBeforeRevocation: vi.fn().mockResolvedValue(false),
}));

// Mock the User model
vi.mock('@/models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(token: string | null, via: 'bearer' | 'cookie' = 'bearer'): Request {
  const headers: Record<string, string> = {};
  if (token) {
    if (via === 'bearer') {
      headers['authorization'] = `Bearer ${token}`;
    } else {
      headers['cookie'] = `auth-token=${token}`;
    }
  }
  return new Request('http://localhost/api/test', { headers });
}

// ---------------------------------------------------------------------------
// generateToken → verifyToken round-trip
// ---------------------------------------------------------------------------
describe('generateToken / verifyToken round-trip', () => {
  it('round-trips all payload fields correctly', () => {
    const payload = {
      userId: 'u1',
      tenantId: 't1',
      email: 'alice@example.com',
      role: 'admin',
    };
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(payload.userId);
    expect(decoded!.tenantId).toBe(payload.tenantId);
    expect(decoded!.email).toBe(payload.email);
    expect(decoded!.role).toBe(payload.role);
  });

  it('produces a three-segment JWT string', () => {
    const token = generateToken({ userId: 'u', tenantId: 't', email: 'e@e.com', role: 'cashier' });
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifyToken returns null for garbage input', () => {
    expect(verifyToken('not.a.jwt')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('verifyToken returns null for a tampered signature', () => {
    const token = generateToken({ userId: 'u', tenantId: 't', email: 'e@e.com', role: 'admin' });
    const tampered = token.slice(0, -6) + 'XXXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — happy path
// ---------------------------------------------------------------------------
describe('getCurrentUser — valid token', () => {
  beforeEach(async () => {
    const { isTokenRevoked, isTokenIssuedBeforeRevocation } = await import('@/lib/token-blacklist');
    vi.mocked(isTokenRevoked).mockResolvedValue(false);
    vi.mocked(isTokenIssuedBeforeRevocation).mockResolvedValue(false);

    const User = (await import('@/models/User')).default;
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: true, tenantId: 'tenant-abc' }),
      }),
    } as unknown as ReturnType<typeof User.findById>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the JWT payload when token is valid and user is active (Bearer header)', async () => {
    const payload = { userId: 'user-1', tenantId: 'tenant-abc', email: 'bob@example.com', role: 'admin' };
    const token = generateToken(payload);
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await getCurrentUser(req);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user-1');
    expect(result!.tenantId).toBe('tenant-abc');
    expect(result!.role).toBe('admin');
  });

  it('returns the JWT payload when token is supplied via auth-token cookie', async () => {
    const payload = { userId: 'user-2', tenantId: 'tenant-abc', email: 'carol@example.com', role: 'cashier' };
    const token = generateToken(payload);
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { cookie: `auth-token=${token}` },
    });
    const result = await getCurrentUser(req);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user-2');
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — revoked token
// ---------------------------------------------------------------------------
describe('getCurrentUser — revoked token', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when isTokenRevoked returns true', async () => {
    const { isTokenRevoked } = await import('@/lib/token-blacklist');
    vi.mocked(isTokenRevoked).mockResolvedValue(true);

    const token = generateToken({ userId: 'u', tenantId: 't', email: 'e@e.com', role: 'admin' });
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await getCurrentUser(req);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — deactivated user
// ---------------------------------------------------------------------------
describe('getCurrentUser — deactivated user', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when user.isActive is false', async () => {
    const { isTokenRevoked, isTokenIssuedBeforeRevocation } = await import('@/lib/token-blacklist');
    vi.mocked(isTokenRevoked).mockResolvedValue(false);
    vi.mocked(isTokenIssuedBeforeRevocation).mockResolvedValue(false);

    const User = (await import('@/models/User')).default;
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ isActive: false, tenantId: 'tenant-abc' }),
      }),
    } as unknown as ReturnType<typeof User.findById>);

    const token = generateToken({ userId: 'u', tenantId: 'tenant-abc', email: 'e@e.com', role: 'manager' });
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await getCurrentUser(req);
    expect(result).toBeNull();
  });

  it('returns null when user is not found in DB', async () => {
    const { isTokenRevoked, isTokenIssuedBeforeRevocation } = await import('@/lib/token-blacklist');
    vi.mocked(isTokenRevoked).mockResolvedValue(false);
    vi.mocked(isTokenIssuedBeforeRevocation).mockResolvedValue(false);

    const User = (await import('@/models/User')).default;
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    } as unknown as ReturnType<typeof User.findById>);

    const token = generateToken({ userId: 'u', tenantId: 't', email: 'e@e.com', role: 'admin' });
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = await getCurrentUser(req);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCurrentUser — missing or invalid token
// ---------------------------------------------------------------------------
describe('getCurrentUser — missing / invalid token', () => {
  it('returns null when no token is present', async () => {
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test');
    const result = await getCurrentUser(req);
    expect(result).toBeNull();
  });

  it('returns null when the token is malformed', async () => {
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://localhost/api/test', {
      headers: { authorization: 'Bearer not.a.real.token' },
    });
    const result = await getCurrentUser(req);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasRole hierarchy
// ---------------------------------------------------------------------------
describe('hasRole — role hierarchy', () => {
  it('super_admin satisfies every role', () => {
    expect(hasRole('super_admin', ['viewer'])).toBe(true);
    expect(hasRole('super_admin', ['cashier'])).toBe(true);
    expect(hasRole('super_admin', ['manager'])).toBe(true);
    expect(hasRole('super_admin', ['admin'])).toBe(true);
    expect(hasRole('super_admin', ['super_admin'])).toBe(true);
  });

  it('admin satisfies admin and below but not super_admin', () => {
    expect(hasRole('admin', ['admin'])).toBe(true);
    expect(hasRole('admin', ['manager'])).toBe(true);
    expect(hasRole('admin', ['cashier'])).toBe(true);
    expect(hasRole('admin', ['super_admin'])).toBe(false);
  });

  it('manager satisfies manager and below but not admin', () => {
    expect(hasRole('manager', ['manager'])).toBe(true);
    expect(hasRole('manager', ['cashier'])).toBe(true);
    expect(hasRole('manager', ['admin'])).toBe(false);
  });

  it('cashier satisfies cashier and viewer but not manager', () => {
    expect(hasRole('cashier', ['cashier'])).toBe(true);
    expect(hasRole('cashier', ['viewer'])).toBe(true);
    expect(hasRole('cashier', ['manager'])).toBe(false);
  });

  it('returns false when role is completely unknown', () => {
    expect(hasRole('ghost', ['viewer'])).toBe(false);
    expect(hasRole('ghost', ['cashier'])).toBe(false);
  });

  it('returns true if user meets any of the listed required roles', () => {
    expect(hasRole('manager', ['admin', 'manager'])).toBe(true);
  });

  it('returns false if user meets none of the listed required roles', () => {
    expect(hasRole('cashier', ['admin', 'manager'])).toBe(false);
  });
});
