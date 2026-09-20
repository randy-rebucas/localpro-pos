-- CreateTable
CREATE TABLE "work_order_time_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_time_entries_tenantId_workOrderId_idx" ON "work_order_time_entries"("tenantId", "workOrderId");

-- CreateIndex
CREATE INDEX "work_order_time_entries_tenantId_userId_startedAt_idx" ON "work_order_time_entries"("tenantId", "userId", "startedAt");

-- AddForeignKey
ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RowLevelSecurity (same tenant/bypass policy shape as other tenant-scoped
-- tables, see 20260920020000_add_rls_all_tenant_tables)
ALTER TABLE "work_order_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_order_time_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_work_order_time_entries ON "work_order_time_entries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
