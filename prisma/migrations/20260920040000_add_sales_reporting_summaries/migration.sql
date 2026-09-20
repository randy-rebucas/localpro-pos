-- CreateTable
CREATE TABLE "daily_sales_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" DATE NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_sales_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_sales_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_sales_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashier_sales_summaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" DATE NOT NULL,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_sales_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_sales_summaries_tenantId_date_idx" ON "daily_sales_summaries"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_summaries_tenantId_branchId_date_key" ON "daily_sales_summaries"("tenantId", "branchId", "date");

-- CreateIndex
CREATE INDEX "monthly_sales_summaries_tenantId_year_month_idx" ON "monthly_sales_summaries"("tenantId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_sales_summaries_tenantId_branchId_year_month_key" ON "monthly_sales_summaries"("tenantId", "branchId", "year", "month");

-- CreateIndex
CREATE INDEX "product_sales_summaries_tenantId_date_idx" ON "product_sales_summaries"("tenantId", "date");

-- CreateIndex
CREATE INDEX "product_sales_summaries_tenantId_productId_idx" ON "product_sales_summaries"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_sales_summaries_tenantId_branchId_productId_date_key" ON "product_sales_summaries"("tenantId", "branchId", "productId", "date");

-- CreateIndex
CREATE INDEX "branch_sales_summaries_tenantId_date_idx" ON "branch_sales_summaries"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "branch_sales_summaries_tenantId_branchId_date_key" ON "branch_sales_summaries"("tenantId", "branchId", "date");

-- CreateIndex
CREATE INDEX "cashier_sales_summaries_tenantId_date_idx" ON "cashier_sales_summaries"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cashier_sales_summaries_tenantId_userId_branchId_date_key" ON "cashier_sales_summaries"("tenantId", "userId", "branchId", "date");

-- AddForeignKey
ALTER TABLE "daily_sales_summaries" ADD CONSTRAINT "daily_sales_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales_summaries" ADD CONSTRAINT "daily_sales_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_sales_summaries" ADD CONSTRAINT "monthly_sales_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_sales_summaries" ADD CONSTRAINT "monthly_sales_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sales_summaries" ADD CONSTRAINT "product_sales_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sales_summaries" ADD CONSTRAINT "product_sales_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_sales_summaries" ADD CONSTRAINT "product_sales_summaries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_summaries" ADD CONSTRAINT "branch_sales_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_sales_summaries" ADD CONSTRAINT "branch_sales_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sales_summaries" ADD CONSTRAINT "cashier_sales_summaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sales_summaries" ADD CONSTRAINT "cashier_sales_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_sales_summaries" ADD CONSTRAINT "cashier_sales_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, same tenant/bypass policy shape as the rest of the
-- tenant-scoped tables (see 20260920000000_add_rls_products and
-- 20260920020000_add_rls_all_tenant_tables).

ALTER TABLE "daily_sales_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_sales_summaries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_daily_sales_summaries ON "daily_sales_summaries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "monthly_sales_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monthly_sales_summaries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_monthly_sales_summaries ON "monthly_sales_summaries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "product_sales_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_sales_summaries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_product_sales_summaries ON "product_sales_summaries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "branch_sales_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branch_sales_summaries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_branch_sales_summaries ON "branch_sales_summaries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "cashier_sales_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cashier_sales_summaries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cashier_sales_summaries ON "cashier_sales_summaries"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

