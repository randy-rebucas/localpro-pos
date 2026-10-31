/**
 * Short-lived in-process caches for hot, rarely-changing lookups.
 *
 * MongoDB Atlas bills per document read, and every authenticated API request
 * used to re-read the same User, Tenant and revocation documents several times.
 * These caches collapse those repeat reads to (at most) one per key per TTL
 * window per server instance.
 *
 * Consistency:
 *  - Writes made through the Tenant/User models in this process clear the
 *    relevant cache immediately (see the post-hooks in models/Tenant.ts and
 *    models/User.ts) and token revocations update the cache directly.
 *  - Other instances see a change after at most DB_CACHE_TTL_MS
 *    (default 60s, override with the DB_CACHE_TTL_MS env var; 0 disables).
 *
 * Callers must treat cached values as read-only.
 */

const DEFAULT_TTL_MS = (() => {
  const raw = process.env.DB_CACHE_TTL_MS;
  if (raw === undefined || raw === '') return process.env.NODE_ENV === 'test' ? 0 : 60_000;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();
  private inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly maxEntries: number = 5_000
  ) {}

  get enabled(): boolean {
    return this.ttlMs > 0;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: V, ttlMs: number = this.ttlMs): void {
    if (ttlMs <= 0) return;
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // Map preserves insertion order — evict the oldest entry.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Return the cached value, or run `loader` once (concurrent callers for the
   * same key share the same in-flight promise) and cache its result.
   * Rejections are not cached.
   */
  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    if (!this.enabled) return loader();

    const entry = this.store.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        // Only cache if nothing invalidated this key while we were loading.
        if (this.inflight.get(key) === promise) this.set(key, value);
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }
}

/** Tenant lookups: by id, slug, host, settings, permission overrides. */
export const tenantCache = new TtlCache<unknown>();

/** User status lookups used by auth (isActive / tenantId). */
export const userCache = new TtlCache<unknown>();

/** Token / user revocation lookups (negative results included). */
export const revocationCache = new TtlCache<unknown>();

/** Computed subscription status per tenant (lib/subscription.ts). */
export const subscriptionCache = new TtlCache<unknown>();

export function invalidateTenantCache(): void {
  tenantCache.clear();
}

export function invalidateUserCache(userId?: string): void {
  if (userId) userCache.delete(`status:${userId}`);
  else userCache.clear();
}

export function invalidateSubscriptionCache(tenantId?: string): void {
  if (tenantId) subscriptionCache.delete(`status:${tenantId}`);
  else subscriptionCache.clear();
}

export function clearAllDbCaches(): void {
  subscriptionCache.clear();
  tenantCache.clear();
  userCache.clear();
  revocationCache.clear();
}
