-- CreateEnum
CREATE TYPE "loyalty_transaction_type" AS ENUM ('earn', 'redeem', 'adjust');

-- CreateEnum
CREATE TYPE "billing_event_type" AS ENUM ('invoice_created', 'payment_received', 'payment_failed', 'refund_issued', 'credit_applied', 'plan_changed', 'trial_started', 'trial_converted', 'subscription_cancelled', 'subscription_suspended', 'subscription_paused', 'subscription_resumed', 'manual_adjustment', 'invoice_generated', 'payment_overdue', 'late_fee_applied', 'reactivation_fee_applied', 'account_deactivated', 'account_reactivated');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused');

-- CreateEnum
CREATE TYPE "billing_cycle" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "subscription_payment_method_type" AS ENUM ('card', 'bank', 'paypal', 'manual');

-- CreateEnum
CREATE TYPE "billing_history_status" AS ENUM ('paid', 'failed', 'pending', 'refunded');

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "transaction_id" UUID,
    "type" "loyalty_transaction_type" NOT NULL,
    "points" INTEGER NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "type" "billing_event_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "description" TEXT,
    "notes" TEXT,
    "transaction_id" TEXT,
    "invoice_url" TEXT,
    "recorded_by" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'trial',
    "billing_cycle" "billing_cycle" NOT NULL DEFAULT 'monthly',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "trial_end_date" TIMESTAMP(3),
    "next_billing_date" TIMESTAMP(3),
    "last_billing_date" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "suspended_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "pause_reason" TEXT,
    "pause_ends_at" TIMESTAMP(3),
    "grace_period_end_date" TIMESTAMP(3),
    "trial_converted_at" TIMESTAMP(3),
    "payment_overdue" BOOLEAN NOT NULL DEFAULT false,
    "outstanding_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "last_invoice_generated_at" TIMESTAMP(3),
    "late_fee_applied_at" TIMESTAMP(3),
    "reactivation_fee_applied_at" TIMESTAMP(3),
    "deactivated_at" TIMESTAMP(3),
    "payment_method" JSONB,
    "usage" JSONB NOT NULL DEFAULT '{}',
    "is_trial" BOOLEAN NOT NULL DEFAULT true,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_billing_history_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "billing_history_status" NOT NULL,
    "transaction_id" TEXT,
    "invoice_url" TEXT,

    CONSTRAINT "subscription_billing_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "clock_in" TIMESTAMP(3) NOT NULL,
    "clock_out" TIMESTAMP(3),
    "break_start" TIMESTAMP(3),
    "break_end" TIMESTAMP(3),
    "total_hours" DECIMAL(6,2),
    "notes" TEXT,
    "location" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenant_id_customer_id_created_at_idx" ON "loyalty_transactions"("tenant_id", "customer_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenant_id_transaction_id_idx" ON "loyalty_transactions"("tenant_id", "transaction_id");

-- CreateIndex
CREATE INDEX "billing_events_tenant_id_created_at_idx" ON "billing_events"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_status_idx" ON "subscriptions"("plan_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_status_next_billing_date_idx" ON "subscriptions"("tenant_id", "status", "next_billing_date");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_is_active_idx" ON "subscriptions"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "subscription_billing_history_entries_subscription_id_date_idx" ON "subscription_billing_history_entries"("subscription_id", "date" DESC);

-- CreateIndex
CREATE INDEX "attendances_tenant_id_user_id_clock_in_idx" ON "attendances"("tenant_id", "user_id", "clock_in" DESC);

-- CreateIndex
CREATE INDEX "attendances_tenant_id_clock_in_idx" ON "attendances"("tenant_id", "clock_in" DESC);

-- CreateIndex
CREATE INDEX "attendances_tenant_id_is_active_idx" ON "attendances"("tenant_id", "is_active");

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_billing_history_entries" ADD CONSTRAINT "subscription_billing_history_entries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
