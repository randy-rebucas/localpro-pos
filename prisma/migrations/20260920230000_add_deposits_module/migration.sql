-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending', 'paid', 'applied', 'refunded', 'forfeited', 'cancelled');

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT,
    "workOrderId" TEXT,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethodSimple" NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'pending',
    "refundedAmount" DECIMAL(18,2),
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposits_tenantId_idempotencyKey_key" ON "deposits"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "deposits_tenantId_status_idx" ON "deposits"("tenantId", "status");

-- CreateIndex
CREATE INDEX "deposits_tenantId_bookingId_idx" ON "deposits"("tenantId", "bookingId");

-- CreateIndex
CREATE INDEX "deposits_tenantId_workOrderId_idx" ON "deposits"("tenantId", "workOrderId");

-- CreateIndex
CREATE INDEX "deposits_tenantId_customerId_idx" ON "deposits"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RowLevelSecurity (same tenant/bypass policy shape as other tenant-scoped
-- tables, see 20260920020000_add_rls_all_tenant_tables)
ALTER TABLE "deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_deposits ON "deposits"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
