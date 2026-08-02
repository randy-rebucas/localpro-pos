-- CreateEnum
CREATE TYPE "onboarding_status" AS ENUM ('not_started', 'in_progress', 'complete');

-- CreateEnum
CREATE TYPE "subscription_tier" AS ENUM ('starter', 'pro', 'business', 'enterprise');

-- CreateEnum
CREATE TYPE "tax_applies_to" AS ENUM ('all', 'products', 'services', 'categories');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "subdomain" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarding_status" "onboarding_status" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "created_by" UUID,
    "grand_total_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grand_total_transaction_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "tier" "subscription_tier" NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "price_setup_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_currency" TEXT NOT NULL DEFAULT 'PHP',
    "reactivation_fee" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "features" JSONB NOT NULL DEFAULT '{}',
    "bir_compliance" JSONB NOT NULL DEFAULT '{}',
    "pharmacy_compliance" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "available_to_new_tenants" BOOLEAN NOT NULL DEFAULT true,
    "yearly_discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Tax',
    "applies_to" "tax_applies_to" NOT NULL DEFAULT 'all',
    "category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "product_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "region" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "granted_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "zip_code" TEXT,
    "country" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_tier_key" ON "subscription_plans"("tier");

-- CreateIndex
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans"("is_active");

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_is_active_priority_idx" ON "tax_rules"("tenant_id", "is_active", "priority" DESC);

-- CreateIndex
CREATE INDEX "tax_rules_tenant_id_applies_to_is_active_idx" ON "tax_rules"("tenant_id", "applies_to", "is_active");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_expires_at_idx" ON "feature_flag_overrides"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_tenant_id_feature_key" ON "feature_flag_overrides"("tenant_id", "feature");

-- CreateIndex
CREATE INDEX "addresses_user_id_tenant_id_idx" ON "addresses"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "files_tenant_id_uploaded_at_idx" ON "files"("tenant_id", "uploaded_at" DESC);

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
