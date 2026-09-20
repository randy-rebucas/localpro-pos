# Tenant isolation: PostgreSQL Row-Level Security (RLS)

## Why

Tenant isolation has always been enforced by every API route manually adding
`tenantId: user.tenantId` to its Prisma queries (see `CLAUDE.md`). That's a
single layer — if a route ever forgets the filter, Postgres returns other
tenants' rows. This has happened before (the subscriptions endpoints leak).

RLS adds a second, independent, database-level layer under the existing
manual filtering. It does not replace it — every route keeps its
`tenantId: ...` filters exactly as before. RLS is the backstop for when that
filter is missing.

All 47 tenant-scoped tables have RLS enabled (see
`prisma/migrations/20260920000000_add_rls_products`,
`20260920010000_rls_bypass_clause`, `20260920020000_add_rls_all_tenant_tables`).

## How it works

Each RLS-enabled table has a policy shaped like:

```sql
CREATE POLICY tenant_isolation_<table> ON "<table>"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
```

Postgres session variables (`app.tenant_id`, `app.bypass_rls`) gate every
row. Nothing sets them automatically — the application must set the right
one before running a query, or the policy denies all rows (fails closed).

### The automatic part: `lib/tenant-context.ts` + `lib/db.ts`

Routes don't set session variables themselves. Instead:

1. **`lib/tenant-context.ts`** holds an `AsyncLocalStorage`-based context per
   request: `{ tenantId }` or `{ bypass: true }`.
2. **`lib/db.ts`** wraps the Prisma client in a query extension
   (`$allOperations`) that, for every query, reads the current context and —
   if one is set — runs the query inside a tiny transaction that first does
   `SELECT set_config('app.tenant_id', <id>, true)` (or `app.bypass_rls`).
   This applies to every model, not just RLS-enabled ones, because a query
   against an unscoped model can still JOIN into a protected one via a
   relation filter/include (e.g. `prisma.tenant.findMany({ where: { settings: {...} } })`).

So: **as long as something calls `setTenantContext(tenantId)` or
`setBypassContext()` once, early in the request**, every subsequent Prisma
call for that request is automatically scoped. No route needs to change its
queries.

### Where context gets set (the choke points)

| Entry point | What it does |
|---|---|
| `lib/auth.ts` (`getCurrentUser` → `requireAuth`/`requireTenantAccess`) | Sets tenant context from the JWT payload; `super_admin` gets bypass instead (no tenantId) |
| `lib/auth-customer.ts` (`getCurrentCustomer`) | Same, for customer-facing JWTs |
| `lib/automation-auth.ts` (`verifyCronAuth`) | Sets bypass for the 31 HTTP-triggered `/api/automations/*` routes |
| `lib/cron.ts` | Sets bypass before each of the 32 node-cron jobs |
| `lib/script-runtime.ts` | Sets bypass; imported first by every `scripts/*.ts` maintenance script |
| Webhook/OAuth routes (`app/api/webhooks/*`, `app/api/integrations/shopify/oauth/callback`) | Resolve the tenant/bypass themselves before touching any tenant-scoped table, since they carry no session/JWT |
| Pre-auth routes (`login`, `login-qr`, `mobile-login`, `register`, customer OTP, booking availability, `services`, `tenants/signup`, `super-admin/auth/login`) | Resolve the tenant by slug/state param first, then call `setTenantContext`/`setBypassContext` before querying anything tenant-scoped |
| `app/api/public/*`, `app/api/stores/retail` | Explicitly cross-tenant by design — bypass |

If you add a new entry point that touches tenant-scoped data without going
through `requireAuth`/`requireTenantAccess`/`getCurrentCustomer`, it needs
its own `setTenantContext`/`setBypassContext` call, or it will silently see
zero rows.

### Multi-step transactions: `dbTransaction`, not `prisma.$transaction`

Prisma denylists overriding `$transaction` via client extensions. That means
`prisma.$transaction(async (tx) => { ... })` on the extended client still
triggers the query extension for every operation on `tx` — each one would
try to open its *own* nested transaction, breaking the atomicity of the
outer one (a partial write could commit even if a later step throws).

Use `dbTransaction` from `lib/db.ts` instead for any multi-step write that
must succeed or fail together:

```ts
import { dbTransaction } from '@/lib/db';

const result = await dbTransaction(async (tx) => {
  await tx.product.update({ where: { id }, data: scalarData });
  await tx.productVariation.deleteMany({ where: { productId: id } });
  return tx.product.findUniqueOrThrow({ where: { id } });
});
```

`dbTransaction` sets the session variable once, directly on the one real
transaction; `tx`'s operations never go through the extension at all.

## Extending this

- **New tenant-scoped model**: add a migration enabling RLS with the same
  policy shape as the ones above. No code changes needed — the extension
  scopes every model automatically once a context is set.
- **New API route**: if it goes through `requireAuth`/`requireTenantAccess`/
  `getCurrentCustomer`, nothing to do. If it's a new pre-auth, webhook, or
  system entry point, add an explicit `setTenantContext`/`setBypassContext`
  call as early as possible, before any tenant-scoped query.
- **New multi-step transaction**: use `dbTransaction`, not
  `prisma.$transaction`.

## Testing

`__tests__/lib/db-rls.integration.test.ts` runs against the real dev
database (not mocked) and verifies: cross-tenant rows are hidden with no
`tenantId` filter at all, contexts are independent per tenant, bypass sees
everything, and `dbTransaction` is both atomic (rolls back on failure) and
tenant-scoped throughout.

## Known follow-up

Most `prisma.$transaction(async tx => ...)` call sites have been converted
to `dbTransaction`. If a new one is added using the raw Prisma method by
mistake, tenant isolation still holds (each operation gets its own nested
scoping) but atomicity across the transaction's steps is weakened.
