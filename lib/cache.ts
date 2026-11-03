/**
 * In-process TTL cache
 *
 * Small Map-backed cache used to absorb repeated MongoDB reads for data that
 * changes rarely (user/tenant active flags, slug→id lookups, subscription
 * status, tax rules). Each serverless instance keeps its own copy, so TTLs are
 * kept short (≤60s) and writers call `cacheDel` / `cacheDelPrefix` to make
 * changes visible immediately on the instance that handled the write.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
// Bumped on every invalidation. A load that started before an invalidation must
// not cache its (possibly stale) result — e.g. a user read as active just before
// being deactivated.
let invalidationEpoch = 0;

const MAX_ENTRIES = 5000;

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict the oldest inserted entry (Map preserves insertion order)
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDel(key: string): void {
  invalidationEpoch++;
  store.delete(key);
  inflight.delete(key);
}

export function cacheDelPrefix(prefix: string): void {
  invalidationEpoch++;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export function cacheClear(): void {
  invalidationEpoch++;
  store.clear();
  inflight.clear();
}

/**
 * Return the cached value for `key`, or run `fn`, cache its result for `ttlMs`
 * and return it. Concurrent callers for the same key share one `fn` call.
 * `null` results are cached too (negative caching); thrown errors are not.
 */
export async function cacheWrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const epochAtStart = invalidationEpoch;
  let promise: Promise<T> | undefined = undefined;
  promise = (async () => {
    try {
      // Yield once so `promise` is assigned and registered in `inflight` before
      // the finally block can run (fn() may throw synchronously)
      await Promise.resolve();
      const value = await fn();
      if (invalidationEpoch === epochAtStart) {
        cacheSet(key, value, ttlMs);
      }
      return value;
    } finally {
      if (inflight.get(key) === promise) inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// ─── Key namespaces & invalidation helpers ─────────────────────────────────

export const CacheKeys = {
  tenantBySlug: (slug: string) => `tenant:slug:${slug}`,
  tenantIdBySlug: (slug: string) => `tenant:id:${slug}`,
  tenantByHost: (host: string) => `tenant:host:${host}`,
  tenantAuth: (tenantId: string) => `tenant:auth:${tenantId}`,
  tenantSettings: (tenantId: string) => `tenant:settings:${tenantId}`,
  tenantLegalDiscounts: (tenantId: string) => `tenant:legaldisc:${tenantId}`,
  tenantHasIntegrations: (tenantId: string) => `tenant:integrations:${tenantId}`,
  userAuth: (userId: string) => `user:auth:${userId}`,
  subscriptionStatus: (tenantId: string) => `sub:status:${tenantId}`,
  taxRules: (tenantId: string) => `tax:rules:${tenantId}`,
} as const;

export function invalidateTenantCache(): void {
  cacheDelPrefix('tenant:');
}

export function invalidateUserCache(userId?: string): void {
  if (userId) cacheDel(CacheKeys.userAuth(userId));
  else cacheDelPrefix('user:');
}

export function invalidateSubscriptionCache(tenantId?: string): void {
  if (tenantId) cacheDel(CacheKeys.subscriptionStatus(tenantId));
  else cacheDelPrefix('sub:');
}

export function invalidateTaxRulesCache(tenantId?: string): void {
  if (tenantId) cacheDel(CacheKeys.taxRules(tenantId));
  else cacheDelPrefix('tax:');
}

/** Common TTLs */
export const TTL = {
  SHORT: 30 * 1000,
  DEFAULT: 60 * 1000,
  LONG: 5 * 60 * 1000,
} as const;
