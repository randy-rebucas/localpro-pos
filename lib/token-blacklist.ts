/**
 * JWT Token Blacklist
 *
 * Provides token revocation for logout, password change, and compromise scenarios.
 *
 * Uses MongoDB as the persistent store for multi-instance / serverless compatibility.
 * Falls back to in-memory store if MongoDB is not available during the check.
 *
 * Tokens are stored by their SHA-256 hash until their natural expiration,
 * at which point they are automatically cleaned up via TTL index.
 */

import crypto from 'crypto';
import mongoose, { Schema, Model } from 'mongoose';
import { revocationCache } from '@/lib/db-cache';

// ─── MongoDB-backed store ───────────────────────────────────────────────────

interface IRevokedToken {
  tokenHash: string;
  reason: string;
  expiresAt: Date;
}

const RevokedTokenSchema = new Schema<IRevokedToken>({
  tokenHash: {
    type: String,
    required: true,
    unique: true, // unique implies index
  },
  reason: {
    type: String,
    default: 'logout',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// TTL index — MongoDB auto-deletes documents when expiresAt is reached
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

function getRevokedTokenModel(): Model<IRevokedToken> {
  return (
    mongoose.models.RevokedToken ||
    mongoose.model<IRevokedToken>('RevokedToken', RevokedTokenSchema)
  );
}

// ─── User-level revocation (password change, etc.) ──────────────────────────

interface IUserRevocation {
  userId: string;
  revokedBefore: Date;
  /** revokedBefore + max JWT lifetime — after this, every affected token has expired anyway. */
  expiresAt: Date;
}

const UserRevocationSchema = new Schema<IUserRevocation>({
  userId: {
    type: String,
    required: true,
    unique: true, // unique implies index
  },
  revokedBefore: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
  },
});

// TTL index — the revocation row is useless once all tokens issued before
// revokedBefore have naturally expired.
UserRevocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DEFAULT_MAX_JWT_LIFETIME_SECONDS = 7 * 86400; // lib/auth.ts default JWT_EXPIRES_IN ('7d')
const FALLBACK_MAX_JWT_LIFETIME_SECONDS = 365 * 86400; // if JWT_EXPIRES_IN can't be parsed, stay conservative

/**
 * Longest lifetime of a staff/super-admin JWT (the tokens revokeAllUserTokens applies to).
 * Mirrors lib/auth.ts generateToken: process.env.JWT_EXPIRES_IN || '7d'
 * (the only other override is impersonation at '1h', which is shorter).
 * Parses the same formats jsonwebtoken/ms accept ("7d", "12h", "2 days"; a bare
 * numeric string is milliseconds). Never returns less than the 7d default.
 */
export function maxUserJwtLifetimeSeconds(raw: string | undefined = process.env.JWT_EXPIRES_IN): number {
  if (!raw) return DEFAULT_MAX_JWT_LIFETIME_SECONDS;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?\s*$/i.exec(raw);
  if (!m) return FALLBACK_MAX_JWT_LIFETIME_SECONDS;
  const n = parseFloat(m[1]);
  const unit = (m[2] || 'ms').toLowerCase();
  let mult: number;
  if (/^(milliseconds?|msecs?|ms)$/.test(unit)) mult = 0.001;
  else if (/^(seconds?|secs?|s)$/.test(unit)) mult = 1;
  else if (/^(minutes?|mins?|m)$/.test(unit)) mult = 60;
  else if (/^(hours?|hrs?|h)$/.test(unit)) mult = 3600;
  else if (/^(days?|d)$/.test(unit)) mult = 86400;
  else if (/^(weeks?|w)$/.test(unit)) mult = 7 * 86400;
  else mult = 365.25 * 86400;
  return Math.max(Math.ceil(n * mult), DEFAULT_MAX_JWT_LIFETIME_SECONDS);
}

function getUserRevocationModel(): Model<IUserRevocation> {
  return (
    mongoose.models.UserRevocation ||
    mongoose.model<IUserRevocation>('UserRevocation', UserRevocationSchema)
  );
}

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

function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
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
  revocationCache.delete(`tok:${key}`);

  // Persist to MongoDB for cross-instance consistency
  if (isMongoConnected()) {
    try {
      const RevokedToken = getRevokedTokenModel();
      await RevokedToken.updateOne(
        { tokenHash: key },
        { $set: { reason, expiresAt } },
        { upsert: true }
      );
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

  // Recently confirmed not revoked (see lib/db-cache.ts) — skip the DB read.
  if (revocationCache.has(`tok:${key}`)) {
    return false;
  }

  // Check MongoDB (cross-instance)
  if (isMongoConnected()) {
    try {
      const RevokedToken = getRevokedTokenModel();
      const found = await RevokedToken.findOne({ tokenHash: key }).select('reason expiresAt').lean();
      if (!found) {
        revocationCache.set(`tok:${key}`, false);
      } else {
        // Cache in memory for subsequent checks in this instance
        memoryStore.set(key, {
          expiresAt: new Date(found.expiresAt).getTime(),
          reason: found.reason,
        });
        return true;
      }
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
  revocationCache.delete(`user:${userId}`);

  // Persist to MongoDB
  if (isMongoConnected()) {
    try {
      const UserRevocation = getUserRevocationModel();
      await UserRevocation.updateOne(
        { userId },
        {
          $set: {
            revokedBefore: new Date(now),
            expiresAt: new Date(now + maxUserJwtLifetimeSeconds() * 1000),
          },
        },
        { upsert: true }
      );
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

  // Recently looked up (see lib/db-cache.ts): false = no record, number = revokedBefore ms.
  const cached = revocationCache.get(`user:${userId}`) as number | false | undefined;
  if (cached !== undefined) {
    return cached !== false && issuedAt * 1000 < cached;
  }

  // Check MongoDB
  if (isMongoConnected()) {
    try {
      const UserRevocation = getUserRevocationModel();
      const record = await UserRevocation.findOne({ userId }).select('revokedBefore').lean();
      if (!record) {
        revocationCache.set(`user:${userId}`, false);
      } else {
        const revokedBefore = new Date(record.revokedBefore).getTime();
        revocationCache.set(`user:${userId}`, revokedBefore);
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
