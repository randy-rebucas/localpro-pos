// Env must be set before any imports
process.env.JWT_SECRET = 'test-secret-for-blacklist-tests-32!!';

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  revokeToken,
  isTokenRevoked,
  revokeAllUserTokens,
  isTokenIssuedBeforeRevocation,
} from '@/lib/token-blacklist';

/**
 * token-blacklist unit tests
 *
 * Mongoose is NOT connected in the test environment (readyState = 0),
 * so all tests exercise the in-memory code paths exclusively.
 * Each test uses a unique token/userId string to avoid cross-test contamination
 * from the module-level Maps.
 */

// ---------------------------------------------------------------------------
// revokeToken / isTokenRevoked
// ---------------------------------------------------------------------------

describe('revokeToken / isTokenRevoked', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('revoked token is detected as revoked', async () => {
    await revokeToken('bl-tok-001', 3600, 'logout');
    expect(await isTokenRevoked('bl-tok-001')).toBe(true);
  });

  it('unknown token is not revoked', async () => {
    expect(await isTokenRevoked('bl-tok-never-revoked')).toBe(false);
  });

  it('expired entry is treated as not revoked', async () => {
    vi.useFakeTimers();
    await revokeToken('bl-tok-002-expiring', 1, 'logout'); // 1-second TTL
    vi.advanceTimersByTime(2000);                           // advance 2 s
    expect(await isTokenRevoked('bl-tok-002-expiring')).toBe(false);
  });

  it('two distinct tokens are tracked independently', async () => {
    await revokeToken('bl-tok-003-a', 3600, 'logout');
    expect(await isTokenRevoked('bl-tok-003-a')).toBe(true);
    expect(await isTokenRevoked('bl-tok-003-b-never-revoked')).toBe(false);
  });

  it('reason parameter defaults to "logout" without throwing', async () => {
    await expect(revokeToken('bl-tok-004-default-reason', 3600)).resolves.toBeUndefined();
  });

  it('revoking an already-revoked token does not throw', async () => {
    await revokeToken('bl-tok-005-double', 3600, 'logout');
    await expect(revokeToken('bl-tok-005-double', 3600, 'logout')).resolves.toBeUndefined();
    expect(await isTokenRevoked('bl-tok-005-double')).toBe(true);
  });

  it('tokens with different reasons are all revoked', async () => {
    await revokeToken('bl-tok-006-pw', 3600, 'password-change');
    await revokeToken('bl-tok-006-comp', 3600, 'compromised');
    expect(await isTokenRevoked('bl-tok-006-pw')).toBe(true);
    expect(await isTokenRevoked('bl-tok-006-comp')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// revokeAllUserTokens / isTokenIssuedBeforeRevocation
// ---------------------------------------------------------------------------

describe('revokeAllUserTokens / isTokenIssuedBeforeRevocation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('token issued before revocation is flagged', async () => {
    const userId = 'usr-bl-001';
    const issuedAt = Math.floor(Date.now() / 1000) - 30; // 30 s ago
    await revokeAllUserTokens(userId);
    expect(await isTokenIssuedBeforeRevocation(userId, issuedAt)).toBe(true);
  });

  it('token issued after revocation is allowed', async () => {
    const userId = 'usr-bl-002';
    await revokeAllUserTokens(userId);
    const issuedAt = Math.floor(Date.now() / 1000) + 60; // future
    expect(await isTokenIssuedBeforeRevocation(userId, issuedAt)).toBe(false);
  });

  it('returns false for user with no revocation record', async () => {
    const result = await isTokenIssuedBeforeRevocation(
      'usr-bl-no-record-xyz',
      Math.floor(Date.now() / 1000)
    );
    expect(result).toBe(false);
  });

  it('second revokeAllUserTokens updates the cutoff', async () => {
    vi.useFakeTimers();
    const userId = 'usr-bl-003-update';

    vi.setSystemTime(10_000); // t = 10_000 ms
    await revokeAllUserTokens(userId); // first cutoff: 10_000 ms

    vi.setSystemTime(20_000); // t = 20_000 ms
    await revokeAllUserTokens(userId); // cutoff updated: 20_000 ms

    // Token issued at 15_000 ms (between the two revocations) is now pre-cutoff
    const issuedAt = 15; // seconds → 15_000 ms
    expect(await isTokenIssuedBeforeRevocation(userId, issuedAt)).toBe(true);
  });

  it('multiple users are tracked independently', async () => {
    const userA = 'usr-bl-004-a';
    const userB = 'usr-bl-004-b';
    const pastIssuedAt = Math.floor(Date.now() / 1000) - 10;

    await revokeAllUserTokens(userA); // only revoke A

    expect(await isTokenIssuedBeforeRevocation(userA, pastIssuedAt)).toBe(true);
    expect(await isTokenIssuedBeforeRevocation(userB, pastIssuedAt)).toBe(false);
  });
});
