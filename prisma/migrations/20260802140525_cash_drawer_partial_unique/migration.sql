-- Enforce at most one open cash drawer session per tenant. Mirrors the Mongoose
-- partial unique index { tenantId, status } { unique: true, partialFilterExpression: { status: 'open' } }.
-- Prisma schema syntax can't express partial indexes, so this is a raw migration.
CREATE UNIQUE INDEX "cash_drawer_sessions_tenant_id_open_status_key"
  ON "cash_drawer_sessions" ("tenant_id")
  WHERE "status" = 'open';