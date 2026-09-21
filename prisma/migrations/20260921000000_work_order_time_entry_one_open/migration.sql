-- Only one open time entry (no end time yet) per technician per work order.
-- Mirrors the attendances_one_open_per_user guard added in
-- 20260918120000_raw_sql_constraints/migration.sql.
CREATE UNIQUE INDEX "work_order_time_entries_one_open_per_user"
  ON "work_order_time_entries" ("tenantId", "workOrderId", "userId")
  WHERE ("endedAt" IS NULL);
