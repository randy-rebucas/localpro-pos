-- Raw-SQL additions Prisma's schema DSL cannot express (see comments in
-- prisma/schema.prisma near Booking, CashDrawerSession, and Attendance).

-- 1. Booking double-booking prevention (was a Mongoose pre('save') hook).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_staff_overlap"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  ) WHERE (status IN ('pending', 'confirmed') AND "staffId" IS NOT NULL);
-- Note: uses tsrange (not tstzrange) because startTime/endTime are stored as
-- `timestamp without time zone` — tstzrange's implicit tz-aware cast is not
-- IMMUTABLE and Postgres rejects it in an index/exclusion-constraint expression.

-- 2. Only one OPEN cash drawer session per tenant.
CREATE UNIQUE INDEX "cash_drawer_sessions_one_open_per_tenant"
  ON "cash_drawer_sessions" ("tenantId")
  WHERE (status = 'open');

-- 3. Only one open attendance session (no clock-out yet) per user.
CREATE UNIQUE INDEX "attendances_one_open_per_user"
  ON "attendances" ("tenantId", "userId")
  WHERE ("clockOut" IS NULL);
