import { describe, it, expect } from 'vitest';

// Set env vars before importing modules
process.env.JWT_SECRET = 'test-secret-for-unit-tests-only-32chars!!';

import { generateToken, verifyToken, hasRole } from '@/lib/auth';

// ---------------------------------------------------------------------------
// generateToken / verifyToken
// ---------------------------------------------------------------------------
describe('JWT token generation and verification', () => {
  const payload = {
    userId: 'user123',
    tenantId: 'tenant456',
    email: 'test@example.com',
    role: 'admin',
  };

  it('generates a valid JWT that can be verified', () => {
    const token = generateToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(payload.userId);
    expect(decoded!.tenantId).toBe(payload.tenantId);
    expect(decoded!.email).toBe(payload.email);
    expect(decoded!.role).toBe(payload.role);
  });

  it('returns null for an invalid token', () => {
    expect(verifyToken('invalid.token.here')).toBeNull();
  });

  it('returns null for a tampered token', () => {
    const token = generateToken(payload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(verifyToken('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasRole (role hierarchy)
// ---------------------------------------------------------------------------
describe('hasRole', () => {
  it('owner can access all roles', () => {
    expect(hasRole('owner', ['viewer'])).toBe(true);
    expect(hasRole('owner', ['cashier'])).toBe(true);
    expect(hasRole('owner', ['manager'])).toBe(true);
    expect(hasRole('owner', ['admin'])).toBe(true);
    expect(hasRole('owner', ['owner'])).toBe(true);
  });

  it('admin can access admin and below', () => {
    expect(hasRole('admin', ['admin'])).toBe(true);
    expect(hasRole('admin', ['manager'])).toBe(true);
    expect(hasRole('admin', ['cashier'])).toBe(true);
    expect(hasRole('admin', ['viewer'])).toBe(true);
  });

  it('admin cannot access owner-level', () => {
    expect(hasRole('admin', ['owner'])).toBe(false);
  });

  it('cashier cannot access manager', () => {
    expect(hasRole('cashier', ['manager'])).toBe(false);
  });

  it('viewer is the lowest role', () => {
    expect(hasRole('viewer', ['viewer'])).toBe(true);
    expect(hasRole('viewer', ['cashier'])).toBe(false);
  });

  it('unknown role has level 0 (no access)', () => {
    expect(hasRole('unknown', ['viewer'])).toBe(false);
  });

  it('accepts any of multiple required roles', () => {
    expect(hasRole('manager', ['admin', 'manager'])).toBe(true);
    expect(hasRole('cashier', ['admin', 'manager'])).toBe(false);
  });
});
