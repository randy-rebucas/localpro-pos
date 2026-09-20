import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId?: string;
  /**
   * Set for code paths that legitimately need cross-tenant access and run
   * outside a per-tenant HTTP request: super_admin sessions, scheduled
   * automations (lib/cron.ts), and one-off maintenance scripts. Tables with
   * an RLS policy (see prisma/migrations/*_add_rls_*) deny all rows when no
   * context is set at all, so these paths must opt into bypass explicitly
   * rather than relying on the "no context" case staying safe by accident.
   */
  bypass?: boolean;
  /**
   * Set for the duration of an explicit `prisma.$transaction(async tx => ...)`
   * callback once the transaction's session variable has already been set
   * once at its start — see the `$transaction` override in lib/db.ts.
   */
  insideExplicitTransaction?: boolean;
}

// Cached on `globalThis`, not just a module-level const: Next.js dev mode
// (Turbopack) can re-evaluate this module more than once across different
// route bundles. Without this, `lib/db.ts`'s query extension could end up
// reading from a *different* AsyncLocalStorage instance than the one
// `setTenantContext` wrote to, silently dropping tenant context on every
// query issued after crossing back into a route handler.
declare global {
  var __tenantContextStorage: AsyncLocalStorage<TenantStore> | undefined;
}

const storage = globalThis.__tenantContextStorage ?? new AsyncLocalStorage<TenantStore>();
globalThis.__tenantContextStorage = storage;

/**
 * Marks the current request's tenant for the Postgres RLS session variable
 * (see `withTenantScoping` in lib/db.ts). Call once per request, as early as
 * possible — lib/auth.ts and lib/auth-customer.ts already do this for every
 * route that goes through `requireAuth`/`getCurrentUser`/`getCurrentCustomer`.
 */
export function setTenantContext(tenantId: string): void {
  storage.enterWith({ tenantId });
}

/** Marks the current execution as trusted/system, bypassing RLS entirely. */
export function setBypassContext(): void {
  storage.enterWith({ bypass: true });
}

export function getTenantContext(): TenantStore | undefined {
  return storage.getStore();
}

/** Runs `fn` with RLS bypassed — for automations and maintenance scripts. */
export function runWithBypass<T>(fn: () => T): T {
  return storage.run({ bypass: true }, fn);
}

/**
 * Runs `fn` with the tenant context set AND marked as already scoped by an
 * enclosing explicit transaction (see the `$transaction` override in
 * lib/db.ts) — operations inside `fn` skip the per-operation auto-wrap.
 */
export function runScopedInTransaction<T>(
  store: TenantStore | undefined,
  fn: () => T
): T {
  if (store?.bypass) {
    return storage.run({ bypass: true, insideExplicitTransaction: true }, fn);
  }
  if (store?.tenantId) {
    return storage.run({ tenantId: store.tenantId, insideExplicitTransaction: true }, fn);
  }
  return fn();
}
