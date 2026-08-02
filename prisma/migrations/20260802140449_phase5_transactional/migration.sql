-- CreateEnum
CREATE TYPE "transaction_payment_method" AS ENUM ('cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('completed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('dine-in', 'takeout', 'delivery');

-- CreateEnum
CREATE TYPE "sales_channel" AS ENUM ('pos', 'shopify', 'woocommerce');

-- CreateEnum
CREATE TYPE "balance_payment_method" AS ENUM ('cash', 'card', 'digital', 'check', 'other');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no-show');

-- CreateEnum
CREATE TYPE "recurrence_type" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "prescription_status" AS ENUM ('pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "cash_drawer_status" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "payment_record_method" AS ENUM ('cash', 'card', 'digital', 'check', 'other', 'on_account');

-- CreateEnum
CREATE TYPE "payment_record_status" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer');

-- CreateEnum
CREATE TYPE "expense_payment_method" AS ENUM ('cash', 'card', 'digital', 'other');

-- CreateEnum
CREATE TYPE "offline_payment_method" AS ENUM ('cash', 'card', 'digital');

-- CreateEnum
CREATE TYPE "offline_sync_status" AS ENUM ('pending', 'processing', 'synced', 'failed');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addresses" JSONB NOT NULL DEFAULT '[]',
    "date_of_birth" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "total_spent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "last_purchase_date" TIMESTAMP(3),
    "loyalty_points_balance" INTEGER NOT NULL DEFAULT 0,
    "account_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit_limit" DECIMAL(14,2),
    "shopify_customer_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "otp" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_balance_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "balance_payment_method" NOT NULL,
    "notes" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_balance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "service_name" TEXT NOT NULL,
    "service_description" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "staff_id" UUID,
    "staff_name" TEXT,
    "notes" TEXT,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_booking_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "service_name" TEXT NOT NULL,
    "service_description" TEXT,
    "staff_id" UUID,
    "staff_name" TEXT,
    "duration" INTEGER NOT NULL,
    "start_time_hour" INTEGER NOT NULL,
    "start_time_minute" INTEGER NOT NULL,
    "recurrence_type" "recurrence_type" NOT NULL,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "day_of_month" INTEGER,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_booking_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "prescription_number" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_age" INTEGER,
    "doctor_name" TEXT NOT NULL,
    "doctor_prc_number" TEXT NOT NULL,
    "doctor_clinic" TEXT,
    "issued_date" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "transaction_id" UUID,
    "status" "prescription_status" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "scanned_copy" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_id" UUID NOT NULL,
    "product_id" UUID,
    "drug_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "instructions" TEXT,
    "dispensed" BOOLEAN NOT NULL DEFAULT false,
    "dispensed_at" TIMESTAMP(3),
    "dispensed_by" UUID,
    "dispensed_transaction_id" UUID,

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Saved Cart',
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_code" TEXT,
    "discount_amount" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_drawer_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "closing_amount" DECIMAL(12,2),
    "expected_amount" DECIMAL(12,2),
    "shortage" DECIMAL(12,2),
    "overage" DECIMAL(12,2),
    "opening_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closing_time" TIMESTAMP(3),
    "status" "cash_drawer_status" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "total_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_discounts" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_drawer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_code" TEXT,
    "discount_category" "discount_category",
    "discount_amount" DECIMAL(12,2),
    "sc_pwd_name" TEXT,
    "sc_pwd_id" TEXT,
    "tax_exempt_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "zero_rated_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "payment_method" "transaction_payment_method" NOT NULL,
    "payment_provider" TEXT,
    "payment_reference" TEXT,
    "bnpl_installments" INTEGER,
    "cash_received" DECIMAL(12,2),
    "change" DECIMAL(12,2),
    "status" "transaction_status" NOT NULL DEFAULT 'completed',
    "customer_id" UUID,
    "loyalty_points_earned" INTEGER,
    "loyalty_points_redeemed" INTEGER,
    "user_id" UUID,
    "device_id" UUID,
    "terminal_id" TEXT,
    "device_serial_number" TEXT,
    "receipt_number" TEXT,
    "notes" TEXT,
    "display_currency" TEXT,
    "display_total" DECIMAL(12,2),
    "order_type" "order_type",
    "table_number" TEXT,
    "table_id" UUID,
    "split_count" INTEGER,
    "sales_channel" "sales_channel",
    "external_order_id" TEXT,
    "channel_sync_key" TEXT,
    "channel_imported_at" TIMESTAMP(3),
    "shopify_fulfilled_at" TIMESTAMP(3),
    "shopify_fulfillment_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "product_id" UUID,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "modifiers" JSONB,
    "prescription_id" UUID,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_split_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "guest_index" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,

    CONSTRAINT "transaction_split_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "method" "payment_record_method" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "payment_record_status" NOT NULL DEFAULT 'pending',
    "details" JSONB,
    "processed_by" UUID,
    "processed_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "refund_reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "transaction_id" UUID,
    "customer_id" UUID,
    "customer_info" JSONB,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2),
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "payment_terms" TEXT,
    "status" "invoice_status" NOT NULL DEFAULT 'draft',
    "paid_at" TIMESTAMP(3),
    "paid_amount" DECIMAL(12,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "variation" JSONB,
    "type" "stock_movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previous_stock" INTEGER NOT NULL,
    "new_stock" INTEGER NOT NULL,
    "reason" TEXT,
    "transaction_id" UUID,
    "user_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" "expense_payment_method" NOT NULL,
    "receipt" TEXT,
    "notes" TEXT,
    "user_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "device_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_code" TEXT,
    "discount_category" "discount_category",
    "discount_amount" DECIMAL(12,2),
    "tax_exempt_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "payment_method" "offline_payment_method" NOT NULL,
    "cash_received" DECIMAL(12,2),
    "change" DECIMAL(12,2),
    "customer_id" UUID,
    "user_id" UUID,
    "notes" TEXT,
    "offline_created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_status" "offline_sync_status" NOT NULL DEFAULT 'pending',
    "synced_transaction_id" UUID,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sync_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "z_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "business_date" TIMESTAMP(3) NOT NULL,
    "beginning_gt" DECIMAL(14,2) NOT NULL,
    "ending_gt" DECIMAL(14,2) NOT NULL,
    "gross_sales" DECIMAL(14,2) NOT NULL,
    "vatable_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_exempt_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "zero_rated_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "void_count" INTEGER NOT NULL DEFAULT 0,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "z_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_tenant_id_phone_idx" ON "customers"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "customers_tenant_id_is_active_idx" ON "customers"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "customers_tenant_id_shopify_customer_id_idx" ON "customers"("tenant_id", "shopify_customer_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_tags_idx" ON "customers"("tenant_id", "tags");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_email_key" ON "customers"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "customer_otps_tenant_id_phone_idx" ON "customer_otps"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "customer_otps_tenant_id_phone_verified_idx" ON "customer_otps"("tenant_id", "phone", "verified");

-- CreateIndex
CREATE INDEX "customer_otps_expires_at_idx" ON "customer_otps"("expires_at");

-- CreateIndex
CREATE INDEX "customer_balance_payments_tenant_id_customer_id_created_at_idx" ON "customer_balance_payments"("tenant_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_tenant_id_start_time_idx" ON "bookings"("tenant_id", "start_time");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_staff_id_start_time_idx" ON "bookings"("tenant_id", "staff_id", "start_time");

-- CreateIndex
CREATE INDEX "bookings_start_time_end_time_idx" ON "bookings"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_status_created_at_idx" ON "bookings"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenant_id_is_active_idx" ON "recurring_booking_templates"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenant_id_staff_id_is_active_idx" ON "recurring_booking_templates"("tenant_id", "staff_id", "is_active");

-- CreateIndex
CREATE INDEX "recurring_booking_templates_tenant_id_recurrence_type_is_ac_idx" ON "recurring_booking_templates"("tenant_id", "recurrence_type", "is_active");

-- CreateIndex
CREATE INDEX "prescriptions_tenant_id_created_at_idx" ON "prescriptions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescriptions_tenant_id_status_created_at_idx" ON "prescriptions"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "prescriptions_tenant_id_valid_until_idx" ON "prescriptions"("tenant_id", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_tenant_id_prescription_number_key" ON "prescriptions"("tenant_id", "prescription_number");

-- CreateIndex
CREATE INDEX "prescription_items_prescription_id_idx" ON "prescription_items"("prescription_id");

-- CreateIndex
CREATE INDEX "saved_carts_tenant_id_user_id_created_at_idx" ON "saved_carts"("tenant_id", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "saved_carts_tenant_id_name_idx" ON "saved_carts"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "cash_drawer_sessions_tenant_id_opening_time_idx" ON "cash_drawer_sessions"("tenant_id", "opening_time" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_created_at_idx" ON "transactions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_branch_id_created_at_idx" ON "transactions"("tenant_id", "branch_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_status_idx" ON "transactions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_is_active_created_at_idx" ON "transactions"("tenant_id", "is_active", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenant_id_receipt_number_key" ON "transactions"("tenant_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenant_id_channel_sync_key_key" ON "transactions"("tenant_id", "channel_sync_key");

-- CreateIndex
CREATE INDEX "transaction_items_transaction_id_idx" ON "transaction_items"("transaction_id");

-- CreateIndex
CREATE INDEX "transaction_items_product_id_idx" ON "transaction_items"("product_id");

-- CreateIndex
CREATE INDEX "transaction_split_payments_transaction_id_idx" ON "transaction_split_payments"("transaction_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_transaction_id_idx" ON "payments"("tenant_id", "transaction_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_created_at_idx" ON "payments"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_tenant_id_method_created_at_idx" ON "payments"("tenant_id", "method", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_method_created_at_idx" ON "payments"("tenant_id", "status", "method", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_processed_by_created_at_idx" ON "payments"("processed_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_tenant_id_is_active_idx" ON "payments"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_customer_id_idx" ON "invoices"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_transaction_id_idx" ON "invoices"("tenant_id", "transaction_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_is_active_idx" ON "invoices"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_number_key" ON "invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_type_created_at_idx" ON "stock_movements"("tenant_id", "type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_transaction_id_idx" ON "stock_movements"("transaction_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_date_idx" ON "expenses"("tenant_id", "date" DESC);

-- CreateIndex
CREATE INDEX "expenses_tenant_id_name_idx" ON "expenses"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_is_active_idx" ON "expenses"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "offline_transactions_tenant_id_sync_status_idx" ON "offline_transactions"("tenant_id", "sync_status");

-- CreateIndex
CREATE INDEX "offline_transactions_tenant_id_device_id_offline_created_at_idx" ON "offline_transactions"("tenant_id", "device_id", "offline_created_at" DESC);

-- CreateIndex
CREATE INDEX "offline_transactions_tenant_id_created_at_idx" ON "offline_transactions"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "z_readings_tenant_id_business_date_idx" ON "z_readings"("tenant_id", "business_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "z_readings_tenant_id_branch_id_business_date_key" ON "z_readings"("tenant_id", "branch_id", "business_date");

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensed_by_fkey" FOREIGN KEY ("dispensed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensed_transaction_id_fkey" FOREIGN KEY ("dispensed_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_split_payments" ADD CONSTRAINT "transaction_split_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_synced_transaction_id_fkey" FOREIGN KEY ("synced_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
