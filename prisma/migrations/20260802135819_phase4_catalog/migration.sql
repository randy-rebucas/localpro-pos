-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('regular', 'bundle', 'service');

-- CreateEnum
CREATE TYPE "laundry_service_type" AS ENUM ('wash', 'dry-clean', 'press', 'repair', 'other');

-- CreateEnum
CREATE TYPE "drug_schedule" AS ENUM ('otc', 'rx', 'dangerous');

-- CreateEnum
CREATE TYPE "ecommerce_provider" AS ENUM ('shopify', 'woocommerce');

-- CreateEnum
CREATE TYPE "discount_value_type" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "discount_category" AS ENUM ('general', 'senior', 'pwd', 'employee', 'promo');

-- CreateEnum
CREATE TYPE "coupon_applies_to" AS ENUM ('all_plans', 'specific_plans');

-- CreateEnum
CREATE TYPE "campaign_channel" AS ENUM ('email', 'sms');

-- CreateEnum
CREATE TYPE "campaign_segment" AS ENUM ('all', 'new', 'regular', 'vip', 'at_risk', 'lapsed');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'sent', 'failed');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    "barcode" TEXT,
    "category" TEXT,
    "category_id" UUID,
    "image" TEXT,
    "product_type" "product_type" NOT NULL DEFAULT 'regular',
    "has_variations" BOOLEAN NOT NULL DEFAULT false,
    "variations" JSONB,
    "modifiers" JSONB,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nutrition_info" JSONB,
    "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
    "zero_rated" BOOLEAN NOT NULL DEFAULT false,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "allow_out_of_stock_sales" BOOLEAN NOT NULL DEFAULT false,
    "low_stock_threshold" INTEGER,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "service_type" "laundry_service_type",
    "weight_based" BOOLEAN NOT NULL DEFAULT false,
    "pickup_delivery" BOOLEAN NOT NULL DEFAULT false,
    "estimated_duration" INTEGER,
    "service_duration" INTEGER,
    "staff_required" INTEGER DEFAULT 1,
    "equipment_required" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generic_name" TEXT,
    "manufacturer" TEXT,
    "prn" TEXT,
    "batch_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "drug_schedule" "drug_schedule",
    "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
    "storage_conditions" TEXT,
    "active_ingredient" TEXT,
    "dosage_strength" TEXT,
    "dosage_form" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_branch_stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_branch_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bundles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "sku" TEXT,
    "category_id" UUID,
    "image" TEXT,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bundle_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bundle_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variation" JSONB,

    CONSTRAINT "product_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channel_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" "ecommerce_provider" NOT NULL,
    "external_product_id" TEXT NOT NULL,
    "external_variant_id" TEXT NOT NULL,
    "inventory_item_id" TEXT,
    "sku" TEXT,
    "variation" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_channel_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "type" "discount_value_type" NOT NULL,
    "value" DECIMAL(7,2) NOT NULL,
    "category" "discount_category" NOT NULL DEFAULT 'general',
    "requires_id_verification" BOOLEAN NOT NULL DEFAULT false,
    "min_purchase_amount" DECIMAL(12,2),
    "max_discount_amount" DECIMAL(12,2),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "discount_value_type" NOT NULL,
    "discount_value" DECIMAL(7,2) NOT NULL,
    "applies_to" "coupon_applies_to" NOT NULL DEFAULT 'all_plans',
    "plan_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "points_per_peso" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "peso_per_point" DECIMAL(6,2) NOT NULL DEFAULT 0.10,
    "min_redemption" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "campaign_channel" NOT NULL,
    "segment" "campaign_segment" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'draft',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_ecommerce_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider" "ecommerce_provider" NOT NULL,
    "shop_domain" TEXT,
    "site_url" TEXT,
    "credentials_encrypted" TEXT NOT NULL,
    "webhook_secret_encrypted" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shopify_location_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "default_branch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ecommerce_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_product_type_track_inventory_idx" ON "products"("tenant_id", "product_type", "track_inventory");

-- CreateIndex
CREATE INDEX "products_tenant_id_has_variations_idx" ON "products"("tenant_id", "has_variations");

-- CreateIndex
CREATE INDEX "products_tenant_id_pinned_created_at_idx" ON "products"("tenant_id", "pinned" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "products_tenant_id_expiry_date_idx" ON "products"("tenant_id", "expiry_date");

-- CreateIndex
CREATE INDEX "products_tenant_id_drug_schedule_idx" ON "products"("tenant_id", "drug_schedule");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_barcode_key" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE INDEX "product_branch_stock_branch_id_idx" ON "product_branch_stock"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_branch_stock_product_id_branch_id_key" ON "product_branch_stock"("product_id", "branch_id");

-- CreateIndex
CREATE INDEX "product_bundles_tenant_id_is_active_idx" ON "product_bundles"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_bundles_tenant_id_sku_key" ON "product_bundles"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "product_bundle_items_bundle_id_idx" ON "product_bundle_items"("bundle_id");

-- CreateIndex
CREATE INDEX "product_bundle_items_product_id_idx" ON "product_bundle_items"("product_id");

-- CreateIndex
CREATE INDEX "product_channel_listings_tenant_id_product_id_provider_idx" ON "product_channel_listings"("tenant_id", "product_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "product_channel_listings_tenant_id_provider_external_varian_key" ON "product_channel_listings"("tenant_id", "provider", "external_variant_id");

-- CreateIndex
CREATE INDEX "discounts_tenant_id_is_active_valid_from_valid_until_idx" ON "discounts"("tenant_id", "is_active", "valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_tenant_id_code_key" ON "discounts"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_is_active_valid_from_valid_until_idx" ON "coupons"("is_active", "valid_from", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_configs_tenant_id_key" ON "loyalty_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_status_created_at_idx" ON "campaigns"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_ecommerce_integrations_shop_domain_idx" ON "tenant_ecommerce_integrations"("shop_domain");

-- CreateIndex
CREATE INDEX "tenant_ecommerce_integrations_site_url_tenant_id_idx" ON "tenant_ecommerce_integrations"("site_url", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_ecommerce_integrations_tenant_id_provider_key" ON "tenant_ecommerce_integrations"("tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "product_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_configs" ADD CONSTRAINT "loyalty_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_default_branch_id_fkey" FOREIGN KEY ("default_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
