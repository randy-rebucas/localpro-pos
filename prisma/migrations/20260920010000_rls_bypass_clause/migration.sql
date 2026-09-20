-- Adds a bypass clause to the products RLS policy for trusted, non-request
-- code paths that legitimately need cross-tenant access: super_admin
-- sessions, scheduled automations (lib/cron.ts and the HTTP-triggered
-- app/api/automations/* routes), and standalone maintenance scripts
-- (scripts/*.ts, via lib/script-runtime.ts). These set
-- `app.bypass_rls = 'true'` instead of `app.tenant_id` — see
-- lib/tenant-context.ts and the `withTenantScoping`/`dbTransaction` helpers
-- in lib/db.ts.
--
-- This is the template policy shape used by every subsequent
-- `..._add_rls_<table>` migration.

DROP POLICY tenant_isolation_products ON "products";

CREATE POLICY tenant_isolation_products ON "products"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
