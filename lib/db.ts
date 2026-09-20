import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { getTenantContext, runScopedInTransaction } from '@/lib/tenant-context';

declare global {
  var prismaBase: PrismaClient | undefined;
}

const isFreshBase = !globalThis.prismaBase;

const base =
  globalThis.prismaBase ??
  new PrismaClient({
    log: [
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaBase = base;
}

// Guarded so these only attach once: Next.js dev mode (Turbopack) can
// re-evaluate this module across separate route bundles, and re-registering
// listeners on every evaluation leaks them onto the same cached `base`
// client (see MaxListenersExceededWarning) without ever removing the old
// ones.
if (isFreshBase) {
  base.$on('error' as never, (e: unknown) => {
    logger.error('Postgres error', e as Record<string, unknown>);
  });

  base.$on('warn' as never, (e: unknown) => {
    logger.warn('Postgres warning', e as Record<string, unknown>);
  });
}

/**
 * Runs a single already-built Prisma query promise (`query(args)`, as handed
 * to a `query` extension callback) with the right RLS session variable set,
 * on the un-extended `base` client so this never recurses back into the
 * extension. Uses the batch `$transaction([...])` form (not an interactive
 * callback) so it's a single round-trip and needs no client-level override.
 */
async function withTenantScoping<T>(operation: Promise<T>): Promise<T> {
  const store = getTenantContext();

  if (store?.insideExplicitTransaction) {
    // Already scoped once at the top of an explicit transaction (see
    // `dbTransaction` below) — don't re-wrap each operation inside it, or
    // child writes would commit independently of the outer transaction and
    // its rollback semantics would break.
    return await operation;
  }

  if (store?.bypass) {
    const [, result] = await base.$transaction([
      base.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`,
      operation as unknown as Prisma.PrismaPromise<T>,
    ]);
    return result;
  }

  if (store?.tenantId) {
    const [, result] = await base.$transaction([
      base.$executeRaw`SELECT set_config('app.tenant_id', ${store.tenantId}, true)`,
      operation as unknown as Prisma.PrismaPromise<T>,
    ]);
    return result;
  }

  // No context at all: fail closed. Any route that forgot to call
  // requireAuth/requireTenantAccess (or a script that forgot to import
  // lib/script-runtime) sees zero rows/no-op writes against RLS-protected
  // tables, rather than silently leaking or querying unscoped.
  return await operation;
}

declare global {
  var prismaExtended: unknown | undefined;
}

// Also cached on `globalThis`, for the same reason as `base` above: if this
// module re-evaluates, a fresh `$extends(...)` call would still close over
// whichever `withTenantScoping`/`getTenantContext` happened to be current
// *at that moment* — stale references would linger on any earlier-created
// extended client instance still held by an already-loaded copy of a
// dependent module.
const prisma =
  (globalThis.prismaExtended as ReturnType<typeof base.$extends>) ??
  base.$extends({
    query: {
      $allModels: {
        // Scoped for every model, not just tables with an RLS policy: a query
        // against an unscoped model (e.g. `Tenant`) can still JOIN into an
        // RLS-protected one via a relation filter/include (e.g.
        // `prisma.tenant.findMany({ where: { settings: { is: {...} } } })`),
        // and that JOIN needs the session variable set just as much as a
        // direct query would. When there's no tenant/bypass context at all,
        // this is a no-op extra round trip for models nothing ever protects.
        async $allOperations({ args, query }) {
          return await withTenantScoping(query(args));
        },
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaExtended = prisma;
}

// Exported as the plain `PrismaClient` type (not the extension's own type)
// so every existing helper typed against `typeof prisma` / `PrismaClient`
// keeps working unchanged — the tenant-scoping behavior above is still live
// at runtime, this only affects what TypeScript sees at the call site.
export default prisma as unknown as PrismaClient;

/**
 * Prisma denylists overriding `$transaction` via client extensions, so
 * `prisma.$transaction(async tx => ...)` on the extended client above still
 * triggers `$allOperations` for every operation on `tx` — each one would try
 * to open its own tiny nested transaction (see `withTenantScoping`), which
 * commits independently of the outer one and breaks its atomicity.
 *
 * Use this instead for any multi-step write on tenant-scoped models that
 * must succeed or fail together (e.g. updating a product row alongside its
 * child tables). It sets the RLS session variable once, directly on the one
 * real transaction, and `tx`'s operations never go through the extension at
 * all (it's a plain, un-extended `Prisma.TransactionClient`).
 */
export async function dbTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }
): Promise<T> {
  const store = getTenantContext();
  return await base.$transaction(async (tx) => {
    if (store?.bypass) {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    } else if (store?.tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${store.tenantId}, true)`;
    }
    return await runScopedInTransaction(store, () => callback(tx));
  }, options);
}
