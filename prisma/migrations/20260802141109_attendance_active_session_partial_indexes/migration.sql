-- Fast lookup of a user's/tenant's currently-open attendance session.
-- Mirrors the Mongoose partial indexes { clockOut: 1 } { partialFilterExpression: { clockOut: null } }.
-- Prisma schema syntax can't express partial indexes, so this is a raw migration.
CREATE INDEX "attendances_user_id_open_session_idx"
  ON "attendances" ("user_id")
  WHERE "clock_out" IS NULL;

CREATE INDEX "attendances_tenant_id_open_session_idx"
  ON "attendances" ("tenant_id")
  WHERE "clock_out" IS NULL;