-- Row-Level Security proof-of-concept: Product table.
-- Defense-in-depth only — existing application-level `tenantId: user.tenantId`
-- filters in every route stay in place unchanged. This adds a database-level
-- backstop so a route that forgets to scope by tenant still cannot read or
-- write another tenant's products.
--
-- Enforcement relies on the app setting `app.tenant_id` via `SET LOCAL` inside
-- a transaction before running Product queries (see `withTenantContext` in
-- lib/db.ts). Sessions that never set it (raw scripts, migrations, unscoped
-- admin tooling) see zero rows rather than erroring, because
-- `current_setting(..., true)` returns NULL when unset.

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;

-- FORCE is required because the app's Postgres role owns this table, and
-- Postgres exempts the owning role from RLS by default.
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_products ON "products"
  USING ("tenantId" = current_setting('app.tenant_id', true));
