/**
 * In-memory sliding window rate limiter.
 * Suitable for single-server / self-hosted deployments (node-cron based).
 * For serverless/multi-instance (Vercel edge), swap the store for
 * @upstash/ratelimit + @upstash/redis.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, entry] of store.entries()) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < oneHourAgo) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

/**
 * Check rate limit for a given key.
 * @param key      - Unique identifier (e.g. IP + endpoint)
 * @param limit    - Max requests allowed within the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed: boolean; remaining: number; resetAfterMs: number }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAfterMs: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter(t => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetAfterMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, resetAfterMs };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetAfterMs: 0,
  };
}

/**
 * Reset the rate-limit counter for a key.
 * Use after a successful action that should clear the penalty
 * (e.g. successful login clears the brute-force counter).
 */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/**
 * Return the current hit count for a key within the given window,
 * without recording a new request. Useful for introspection/logging.
 */
export function getRateLimitCount(key: string, windowMs: number): number {
  const entry = store.get(key);
  if (!entry) return 0;
  const windowStart = Date.now() - windowMs;
  return entry.timestamps.filter(t => t > windowStart).length;
}

/**
 * Get the best available client IP from a Next.js request.
 */
export function getClientIp(request: Request): string {
  return (
    (request.headers as Headers).get('x-forwarded-for')?.split(',')[0].trim() ||
    (request.headers as Headers).get('x-real-ip') ||
    'unknown'
  );
}
