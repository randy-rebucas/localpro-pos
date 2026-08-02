/**
 * JWT Token Blacklist
 *
 * Provides token revocation for logout, password change, and compromise scenarios.
 *
 * Uses PostgreSQL as the persistent store for multi-instance / serverless compatibility.
 * Falls back to in-memory store if the DB write/read fails.
 *
 * Tokens are stored by their SHA-256 hash until their natural expiration. Unlike
 * Mongo's TTL index, Postgres has no auto-expiry — a scheduled cleanup job must
 * purge expired rows explicitly (see lib/automations/session-expiration.ts or a
 * dedicated cleanup job).
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';

// ─── In-memory fallback (used when DB writes fail) ──────────────────────────

interface BlacklistEntry {
  expiresAt: number; // epoch ms
  reason: string;
}

const memoryStore = new Map<string, BlacklistEntry>();
const userRevokeTimestamps = new Map<string, number>();

// Cleanup expired in-memory entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}, 10 * 60 * 1000).unref?.();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Hash a token for storage (avoids storing raw JWTs).
 */
function tokenKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
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

  // Persist to Postgres for cross-instance consistency
  try {
    await prisma.revokedToken.upsert({
      where: { tokenHash: key },
      create: { tokenHash: key, reason, expiresAt },
      update: { reason, expiresAt },
    });
  } catch {
    // In-memory fallback already set above
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

  // Check Postgres (cross-instance)
  try {
    const found = await prisma.revokedToken.findUnique({ where: { tokenHash: key } });
    if (found) {
      // Cache in memory for subsequent checks in this instance
      memoryStore.set(key, {
        expiresAt: found.expiresAt.getTime(),
        reason: found.reason,
      });
      return true;
    }
  } catch {
    // Fall through to false if DB is unavailable
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

  // Persist to Postgres
  try {
    await prisma.userRevocation.upsert({
      where: { userId },
      create: { userId, revokedBefore: new Date(now) },
      update: { revokedBefore: new Date(now) },
    });
  } catch {
    // In-memory fallback already set
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

  // Check Postgres
  try {
    const record = await prisma.userRevocation.findUnique({ where: { userId } });
    if (record) {
      const revokedBefore = record.revokedBefore.getTime();
      // Cache for future checks
      userRevokeTimestamps.set(userId, revokedBefore);
      return issuedAt * 1000 < revokedBefore;
    }
  } catch {
    // Fall through
  }

  return false;
}
