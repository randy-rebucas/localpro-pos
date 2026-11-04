/**
 * JWT Token Blacklist
 *
 * Provides token revocation for logout, password change, and compromise scenarios.
 *
 * Uses the database (lib/db tokenRevocations) as the persistent store for
 * multi-instance / serverless compatibility. Falls back to the in-memory store
 * if the database is not connected during the check.
 *
 * Tokens are stored by their SHA-256 hash until their natural expiration,
 * at which point they are cleaned up (Mongo TTL index; Postgres ttl-cleanup job).
 */

import crypto from 'crypto';
import { getRepos } from '@/lib/db';

interface BlacklistEntry {
  expiresAt: number; // epoch ms
  reason: string;
}

const memoryStore = new Map<string, BlacklistEntry>();
const userRevokeTimestamps = new Map<string, number>();

// Negative caches: "checked the DB, not revoked" — avoids two database reads on
// every authenticated request. A revocation made on another instance becomes
// visible here within NEGATIVE_CACHE_TTL_MS; revocations made on this instance
// clear the entry immediately.
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;
const notRevokedTokens = new Map<string, number>(); // tokenKey -> checkedUntil
const userRevocationChecked = new Map<string, number>(); // userId -> checkedUntil

// Cleanup expired in-memory entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
  for (const [key, until] of notRevokedTokens.entries()) {
    if (until <= now) notRevokedTokens.delete(key);
  }
  for (const [key, until] of userRevocationChecked.entries()) {
    if (until <= now) userRevocationChecked.delete(key);
  }
}, 10 * 60 * 1000).unref?.();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Hash a token for storage (avoids storing raw JWTs).
 */
function tokenKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

function isDbReady(): boolean {
  return getRepos().tokenRevocations.isReady();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Add a token to the blacklist.
 * @param token     - The raw JWT string
 * @param expiresIn - Seconds until the token naturally expires (e.g. 7 * 86400 for 7d)
 * @param reason    - Why the token was revoked (logout, password-change, etc.)
 */
export async function revokeToken(
  token: string,
  expiresIn: number,
  reason: string = 'logout'
): Promise<void> {
  const key = tokenKey(token);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // Always write to in-memory as immediate cache
  memoryStore.set(key, { expiresAt: expiresAt.getTime(), reason });
  notRevokedTokens.delete(key);

  // Persist to the database for cross-instance consistency
  if (isDbReady()) {
    try {
      await getRepos().tokenRevocations.revokeToken(key, reason, expiresAt);
    } catch {
      // In-memory fallback already set above
    }
  }
}

/**
 * Check if a token has been revoked.
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const key = tokenKey(token);
  const now = Date.now();

  // Check in-memory first (fast path)
  const memEntry = memoryStore.get(key);
  if (memEntry) {
    if (memEntry.expiresAt <= now) {
      memoryStore.delete(key);
      return false;
    }
    return true;
  }

  const checkedUntil = notRevokedTokens.get(key);
  if (checkedUntil && checkedUntil > now) {
    return false;
  }

  // Check the database (cross-instance)
  if (isDbReady()) {
    try {
      const found = await getRepos().tokenRevocations.findRevokedToken(key);
      if (found) {
        // Cache in memory for subsequent checks in this instance
        memoryStore.set(key, {
          expiresAt: new Date(found.expiresAt).getTime(),
          reason: found.reason,
        });
        return true;
      }
      notRevokedTokens.set(key, now + NEGATIVE_CACHE_TTL_MS);
    } catch {
      // Fall through to false if DB is unavailable
    }
  }

  return false;
}

/**
 * Revoke all tokens for a user by adding a "revoke-before" timestamp.
 * Any token issued before this timestamp should be considered invalid.
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const now = Date.now();

  // In-memory cache
  userRevokeTimestamps.set(userId, now);
  userRevocationChecked.set(userId, now + NEGATIVE_CACHE_TTL_MS);

  // Persist to the database
  if (isDbReady()) {
    try {
      await getRepos().tokenRevocations.revokeUserTokensBefore(userId, new Date(now));
    } catch {
      // In-memory fallback already set
    }
  }
}

/**
 * Check if a token was issued before the user's revoke timestamp.
 * @param userId   - The user ID
 * @param issuedAt - The `iat` claim from the JWT (epoch seconds)
 */
export async function isTokenIssuedBeforeRevocation(
  userId: string,
  issuedAt: number
): Promise<boolean> {
  // Check in-memory first
  const memTimestamp = userRevokeTimestamps.get(userId);
  if (memTimestamp && issuedAt * 1000 < memTimestamp) {
    return true;
  }

  // The DB record was read recently — the in-memory timestamp (if any) is current
  const now = Date.now();
  const checkedUntil = userRevocationChecked.get(userId);
  if (checkedUntil && checkedUntil > now) {
    return false;
  }

  // Check the database
  if (isDbReady()) {
    try {
      const record = await getRepos().tokenRevocations.findUserRevocation(userId);
      userRevocationChecked.set(userId, now + NEGATIVE_CACHE_TTL_MS);
      if (record) {
        const revokedBefore = new Date(record.revokedBefore).getTime();
        // Cache for future checks
        userRevokeTimestamps.set(userId, revokedBefore);
        return issuedAt * 1000 < revokedBefore;
      }
    } catch {
      // Fall through
    }
  }

  return false;
}
