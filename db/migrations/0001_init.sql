CREATE TABLE "tenants" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"subdomain" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"onboarding_status" text DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"created_by" char(24),
	"grand_total_sales" numeric(14, 2) DEFAULT 0 NOT NULL,
	"grand_total_transaction_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "tenants_onboarding_status_check" CHECK ("tenants"."onboarding_status" IN ('not_started', 'in_progress', 'complete')),
	CONSTRAINT "tenants_grand_totals_non_negative" CHECK ("tenants"."grand_total_sales" >= 0 AND "tenants"."grand_total_transaction_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'cashier' NOT NULL,
	"qr_token" text,
	"tenant_id" char(24),
	"branch_id" char(24),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin')),
	CONSTRAINT "users_tenant_required" CHECK ("users"."role" = 'super_admin' OR "users"."tenant_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"address_street" text,
	"address_city" text,
	"address_state" text,
	"address_zip_code" text,
	"address_country" text,
	"phone" text,
	"email" text,
	"manager_id" char(24),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"branch_id" char(24),
	"label" text NOT NULL,
	"serial_number" text NOT NULL,
	"terminal_id" text NOT NULL,
	"ptu_number" text,
	"ptu_status" text DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"registered_by" char(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_ptu_status_check" CHECK ("devices"."ptu_status" IN ('pending', 'approved'))
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"branch_id" char(24),
	"name" text NOT NULL,
	"capacity" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"current_order_id" char(24),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_tables_status_check" CHECK ("dining_tables"."status" IN ('open', 'occupied', 'check-requested')),
	CONSTRAINT "dining_tables_capacity_check" CHECK ("dining_tables"."capacity" IS NULL OR "dining_tables"."capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_method" text NOT NULL,
	"receipt" text,
	"notes" text,
	"user_id" char(24) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_payment_method_check" CHECK ("expenses"."payment_method" IN ('cash', 'card', 'digital', 'other')),
	CONSTRAINT "expenses_amount_non_negative" CHECK ("expenses"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_branch_stock" (
	"tenant_id" char(24) NOT NULL,
	"product_id" char(24) NOT NULL,
	"branch_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	CONSTRAINT "product_branch_stock_pkey" PRIMARY KEY("product_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "product_bundle_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"bundle_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"product_id" char(24) NOT NULL,
	"product_name" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"variation_size" text,
	"variation_color" text,
	"variation_type" text,
	CONSTRAINT "product_bundle_items_quantity_min" CHECK ("product_bundle_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "product_bundles" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(14, 2) NOT NULL,
	"sku" text,
	"category_id" char(24),
	"image" text,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_bundles_price_non_negative" CHECK ("product_bundles"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_channel_listings" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"product_id" char(24) NOT NULL,
	"provider" text NOT NULL,
	"external_product_id" text NOT NULL,
	"external_variant_id" text NOT NULL,
	"inventory_item_id" text,
	"sku" text,
	"variation_size" text,
	"variation_color" text,
	"variation_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_channel_listings_provider_check" CHECK ("product_channel_listings"."provider" IN ('shopify', 'woocommerce'))
);
--> statement-breakpoint
CREATE TABLE "product_variations" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"product_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"size" text,
	"color" text,
	"type" text,
	"sku" text,
	"price" numeric(14, 2),
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	CONSTRAINT "product_variations_price_non_negative" CHECK ("product_variations"."price" IS NULL OR "product_variations"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(14, 2) NOT NULL,
	"stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"sku" text,
	"barcode" text,
	"category" text,
	"category_id" char(24),
	"image" text,
	"product_type" text DEFAULT 'regular' NOT NULL,
	"has_variations" boolean DEFAULT false NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"zero_rated" boolean DEFAULT false NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"allow_out_of_stock_sales" boolean DEFAULT false NOT NULL,
	"low_stock_threshold" numeric(14, 3),
	"pinned" boolean DEFAULT false NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"nutrition_info" jsonb,
	"service_type" text,
	"weight_based" boolean DEFAULT false NOT NULL,
	"pickup_delivery" boolean DEFAULT false NOT NULL,
	"estimated_duration" integer,
	"service_duration" integer,
	"staff_required" integer DEFAULT 1 NOT NULL,
	"equipment_required" text[] DEFAULT '{}'::text[] NOT NULL,
	"generic_name" text,
	"manufacturer" text,
	"prn" text,
	"batch_number" text,
	"expiry_date" timestamp with time zone,
	"drug_schedule" text,
	"requires_prescription" boolean DEFAULT false NOT NULL,
	"storage_conditions" text,
	"active_ingredient" text,
	"dosage_strength" text,
	"dosage_form" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_product_type_check" CHECK ("products"."product_type" IN ('regular', 'bundle', 'service')),
	CONSTRAINT "products_service_type_check" CHECK ("products"."service_type" IS NULL OR "products"."service_type" IN ('wash', 'dry-clean', 'press', 'repair', 'other')),
	CONSTRAINT "products_drug_schedule_check" CHECK ("products"."drug_schedule" IS NULL OR "products"."drug_schedule" IN ('otc', 'rx', 'dangerous')),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_non_negative_check" CHECK (("products"."low_stock_threshold" IS NULL OR "products"."low_stock_threshold" >= 0)
        AND ("products"."estimated_duration" IS NULL OR "products"."estimated_duration" >= 0)
        AND ("products"."service_duration" IS NULL OR "products"."service_duration" >= 0)
        AND "products"."staff_required" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tax_rule_categories" (
	"tenant_id" char(24) NOT NULL,
	"tax_rule_id" char(24) NOT NULL,
	"category_id" char(24) NOT NULL,
	CONSTRAINT "tax_rule_categories_pkey" PRIMARY KEY("tax_rule_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rule_products" (
	"tenant_id" char(24) NOT NULL,
	"tax_rule_id" char(24) NOT NULL,
	"product_id" char(24) NOT NULL,
	CONSTRAINT "tax_rule_products_pkey" PRIMARY KEY("tax_rule_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "tax_rules" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"label" text DEFAULT 'Tax' NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"region_country" text,
	"region_state" text,
	"region_city" text,
	"region_zip_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rules_applies_to_check" CHECK ("tax_rules"."applies_to" IN ('all', 'products', 'services', 'categories')),
	CONSTRAINT "tax_rules_rate_range" CHECK ("tax_rules"."rate" >= 0 AND "tax_rules"."rate" <= 100),
	CONSTRAINT "tax_rules_priority_non_negative" CHECK ("tax_rules"."priority" >= 0)
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"invoice_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"quantity" numeric(14, 3) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	CONSTRAINT "invoice_items_values_check" CHECK ("invoice_items"."quantity" >= 1 AND "invoice_items"."price" >= 0 AND "invoice_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"invoice_number" text NOT NULL,
	"transaction_id" char(24),
	"customer_id" char(24),
	"customer_info" jsonb,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_amount" numeric(14, 2),
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"payment_terms" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_amount" numeric(14, 2),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
	CONSTRAINT "invoices_amounts_non_negative" CHECK ("invoices"."subtotal" >= 0 AND "invoices"."tax_amount" >= 0 AND "invoices"."total" >= 0
        AND ("invoices"."discount_amount" IS NULL OR "invoices"."discount_amount" >= 0)
        AND ("invoices"."paid_amount" IS NULL OR "invoices"."paid_amount" >= 0))
);
--> statement-breakpoint
CREATE TABLE "offline_transaction_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"offline_transaction_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"product_id" char(24),
	"name" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	CONSTRAINT "offline_transaction_items_values_check" CHECK ("offline_transaction_items"."quantity" >= 1 AND "offline_transaction_items"."price" >= 0 AND "offline_transaction_items"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "offline_transactions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"branch_id" char(24),
	"device_id" text NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_code" text,
	"discount_category" text,
	"discount_amount" numeric(14, 2),
	"tax_exempt_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"cash_received" numeric(14, 2),
	"change" numeric(14, 2),
	"customer_id" char(24),
	"user_id" char(24),
	"notes" text,
	"offline_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"synced_transaction_id" char(24),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"sync_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offline_transactions_discount_category_check" CHECK ("offline_transactions"."discount_category" IS NULL OR "offline_transactions"."discount_category" IN ('general', 'senior', 'pwd', 'employee', 'promo')),
	CONSTRAINT "offline_transactions_payment_method_check" CHECK ("offline_transactions"."payment_method" IN ('cash', 'card', 'digital')),
	CONSTRAINT "offline_transactions_sync_status_check" CHECK ("offline_transactions"."sync_status" IN ('pending', 'processing', 'synced', 'failed')),
	CONSTRAINT "offline_transactions_amounts_non_negative" CHECK ("offline_transactions"."subtotal" >= 0 AND "offline_transactions"."total" >= 0 AND "offline_transactions"."tax_exempt_amount" >= 0 AND "offline_transactions"."tax_amount" >= 0
        AND ("offline_transactions"."discount_amount" IS NULL OR "offline_transactions"."discount_amount" >= 0)
        AND ("offline_transactions"."cash_received" IS NULL OR "offline_transactions"."cash_received" >= 0)
        AND ("offline_transactions"."change" IS NULL OR "offline_transactions"."change" >= 0)
        AND "offline_transactions"."retry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"transaction_id" char(24) NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"details" jsonb,
	"processed_by" char(24),
	"processed_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" IN ('cash', 'card', 'digital', 'check', 'other', 'on_account')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" IN ('pending', 'completed', 'failed', 'refunded')),
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pos_sessions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"session_id" text NOT NULL,
	"cart" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"discount" jsonb,
	"tax_amount" numeric(14, 2),
	"tax_rate" numeric(12, 6),
	"tax_label" text,
	"tip" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"payment_method" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"last_update" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_sessions_payment_status_check" CHECK ("pos_sessions"."payment_status" IN ('pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"prescription_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"product_id" char(24),
	"drug_name" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"dosage" text NOT NULL,
	"frequency" text NOT NULL,
	"instructions" text,
	"dispensed" boolean DEFAULT false NOT NULL,
	"dispensed_at" timestamp with time zone,
	"dispensed_by" char(24),
	"dispensed_transaction_id" char(24),
	CONSTRAINT "prescription_items_quantity_min" CHECK ("prescription_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"prescription_number" text NOT NULL,
	"patient_name" text NOT NULL,
	"patient_age" integer,
	"doctor_name" text NOT NULL,
	"doctor_prc_number" text NOT NULL,
	"doctor_clinic" text,
	"issued_date" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"transaction_id" char(24),
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"scanned_copy" text,
	"created_by" char(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescriptions_status_check" CHECK ("prescriptions"."status" IN ('pending', 'partially_dispensed', 'dispensed', 'expired', 'cancelled')),
	CONSTRAINT "prescriptions_patient_age_non_negative" CHECK ("prescriptions"."patient_age" IS NULL OR "prescriptions"."patient_age" >= 0)
);
--> statement-breakpoint
CREATE TABLE "saved_cart_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"saved_cart_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"product_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"stock" numeric(14, 3) NOT NULL,
	CONSTRAINT "saved_cart_items_values_check" CHECK ("saved_cart_items"."price" >= 0 AND "saved_cart_items"."quantity" >= 1 AND "saved_cart_items"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "saved_carts" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text DEFAULT 'Saved Cart' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_code" text,
	"discount_amount" numeric(14, 2),
	"total" numeric(14, 2) NOT NULL,
	"user_id" char(24) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_carts_amounts_non_negative" CHECK ("saved_carts"."subtotal" >= 0 AND "saved_carts"."total" >= 0 AND ("saved_carts"."discount_amount" IS NULL OR "saved_carts"."discount_amount" >= 0))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"product_id" char(24) NOT NULL,
	"branch_id" char(24),
	"variation_size" text,
	"variation_color" text,
	"variation_type" text,
	"type" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"previous_stock" numeric(14, 3) NOT NULL,
	"new_stock" numeric(14, 3) NOT NULL,
	"reason" text,
	"transaction_id" char(24),
	"user_id" char(24),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_type_check" CHECK ("stock_movements"."type" IN ('sale', 'purchase', 'adjustment', 'return', 'damage', 'transfer'))
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"transaction_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"product_id" char(24),
	"name" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"modifiers" jsonb,
	"prescription_id" char(24),
	CONSTRAINT "transaction_items_quantity_min" CHECK ("transaction_items"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "transaction_split_payments" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"transaction_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"guest_index" integer NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	CONSTRAINT "transaction_split_payments_amount_non_negative" CHECK ("transaction_split_payments"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"branch_id" char(24),
	"subtotal" numeric(14, 2) NOT NULL,
	"discount_code" text,
	"discount_category" text,
	"discount_amount" numeric(14, 2),
	"sc_pwd_name" text,
	"sc_pwd_id" text,
	"tax_exempt_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"zero_rated_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"payment_method" text NOT NULL,
	"payment_provider" text,
	"payment_reference" text,
	"bnpl_installments" integer,
	"cash_received" numeric(14, 2),
	"change" numeric(14, 2),
	"status" text DEFAULT 'completed' NOT NULL,
	"customer_id" char(24),
	"loyalty_points_earned" integer,
	"loyalty_points_redeemed" integer,
	"user_id" char(24),
	"device_id" char(24),
	"terminal_id" text,
	"device_serial_number" text,
	"receipt_number" text,
	"idempotency_key" text,
	"notes" text,
	"display_currency" text,
	"display_total" numeric(14, 2),
	"order_type" text,
	"table_number" text,
	"table_id" char(24),
	"split_count" integer,
	"sales_channel" text,
	"external_order_id" text,
	"channel_sync_key" text,
	"channel_imported_at" timestamp with time zone,
	"shopify_fulfilled_at" timestamp with time zone,
	"shopify_fulfillment_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_discount_category_check" CHECK ("transactions"."discount_category" IS NULL OR "transactions"."discount_category" IN ('general', 'senior', 'pwd', 'employee', 'promo')),
	CONSTRAINT "transactions_payment_method_check" CHECK ("transactions"."payment_method" IN ('cash', 'card', 'digital', 'tap_to_pay', 'wallet', 'qr_code', 'bnpl', 'on_account')),
	CONSTRAINT "transactions_status_check" CHECK ("transactions"."status" IN ('completed', 'cancelled', 'refunded')),
	CONSTRAINT "transactions_order_type_check" CHECK ("transactions"."order_type" IS NULL OR "transactions"."order_type" IN ('dine-in', 'takeout', 'delivery')),
	CONSTRAINT "transactions_sales_channel_check" CHECK ("transactions"."sales_channel" IS NULL OR "transactions"."sales_channel" IN ('pos', 'shopify', 'woocommerce')),
	CONSTRAINT "transactions_amounts_non_negative" CHECK ("transactions"."subtotal" >= 0 AND "transactions"."total" >= 0
        AND "transactions"."tax_exempt_amount" >= 0 AND "transactions"."zero_rated_amount" >= 0 AND "transactions"."tax_amount" >= 0
        AND ("transactions"."discount_amount" IS NULL OR "transactions"."discount_amount" >= 0)
        AND ("transactions"."cash_received" IS NULL OR "transactions"."cash_received" >= 0)
        AND ("transactions"."change" IS NULL OR "transactions"."change" >= 0)
        AND ("transactions"."display_total" IS NULL OR "transactions"."display_total" >= 0)
        AND ("transactions"."loyalty_points_earned" IS NULL OR "transactions"."loyalty_points_earned" >= 0)
        AND ("transactions"."loyalty_points_redeemed" IS NULL OR "transactions"."loyalty_points_redeemed" >= 0)),
	CONSTRAINT "transactions_bnpl_installments_min" CHECK ("transactions"."bnpl_installments" IS NULL OR "transactions"."bnpl_installments" >= 1),
	CONSTRAINT "transactions_split_count_min" CHECK ("transactions"."split_count" IS NULL OR "transactions"."split_count" >= 2)
);
--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"user_id" char(24) NOT NULL,
	"label" text DEFAULT 'Home' NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"state" text,
	"zip_code" text,
	"country" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"segment" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" char(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_channel_check" CHECK ("campaigns"."channel" IN ('email', 'sms')),
	CONSTRAINT "campaigns_segment_check" CHECK ("campaigns"."segment" IN ('all', 'new', 'regular', 'vip', 'at_risk', 'lapsed')),
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" IN ('draft', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "customer_balance_payments" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"customer_id" char(24) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"notes" text,
	"recorded_by" char(24),
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_balance_payments_method_check" CHECK ("customer_balance_payments"."method" IN ('cash', 'card', 'digital', 'check', 'other')),
	CONSTRAINT "customer_balance_payments_amount_positive" CHECK ("customer_balance_payments"."amount" >= 0.01)
);
--> statement-breakpoint
CREATE TABLE "customer_otps" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"phone" text NOT NULL,
	"otp" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_otps_otp_length" CHECK (char_length("customer_otps"."otp") = 6)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_of_birth" timestamp with time zone,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_spent" numeric(14, 2) DEFAULT 0 NOT NULL,
	"last_purchase_date" timestamp with time zone,
	"loyalty_points_balance" integer DEFAULT 0 NOT NULL,
	"account_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"credit_limit" numeric(14, 2),
	"shopify_customer_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_format" CHECK ("customers"."email" IS NULL OR "customers"."email" ~ '^\S+@\S+\.\S+$'),
	CONSTRAINT "customers_amounts_non_negative" CHECK ("customers"."total_spent" >= 0 AND "customers"."loyalty_points_balance" >= 0 AND "customers"."account_balance" >= 0 AND ("customers"."credit_limit" IS NULL OR "customers"."credit_limit" >= 0))
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"description" text,
	"type" text NOT NULL,
	"value" numeric(12, 6) NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"requires_id_verification" boolean DEFAULT false NOT NULL,
	"min_purchase_amount" numeric(14, 2),
	"max_discount_amount" numeric(14, 2),
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_type_check" CHECK ("discounts"."type" IN ('percentage', 'fixed')),
	CONSTRAINT "discounts_category_check" CHECK ("discounts"."category" IN ('general', 'senior', 'pwd', 'employee', 'promo')),
	CONSTRAINT "discounts_value_check" CHECK ("discounts"."value" >= 0 AND ("discounts"."type" <> 'percentage' OR "discounts"."value" <= 100)),
	CONSTRAINT "discounts_valid_range_check" CHECK ("discounts"."valid_until" > "discounts"."valid_from"),
	CONSTRAINT "discounts_amounts_check" CHECK (("discounts"."min_purchase_amount" IS NULL OR "discounts"."min_purchase_amount" >= 0) AND ("discounts"."max_discount_amount" IS NULL OR "discounts"."max_discount_amount" >= 0) AND ("discounts"."usage_limit" IS NULL OR "discounts"."usage_limit" >= 1) AND "discounts"."usage_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "loyalty_configs" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"points_per_peso" numeric(12, 6) DEFAULT 1 NOT NULL,
	"peso_per_point" numeric(12, 6) DEFAULT 0.1 NOT NULL,
	"min_redemption" integer DEFAULT 100 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_configs_values_check" CHECK ("loyalty_configs"."points_per_peso" >= 0.01 AND "loyalty_configs"."peso_per_point" >= 0.01 AND "loyalty_configs"."min_redemption" >= 1)
);
--> statement-breakpoint
CREATE TABLE "loyalty_transactions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"customer_id" char(24) NOT NULL,
	"transaction_id" char(24),
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"description" text NOT NULL,
	"created_by" char(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_transactions_type_check" CHECK ("loyalty_transactions"."type" IN ('earn', 'redeem', 'adjust')),
	CONSTRAINT "loyalty_transactions_balances_non_negative" CHECK ("loyalty_transactions"."balance_before" >= 0 AND "loyalty_transactions"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"user_id" char(24) NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"break_start" timestamp with time zone,
	"break_end" timestamp with time zone,
	"total_hours" numeric(7, 2),
	"notes" text,
	"location_latitude" double precision,
	"location_longitude" double precision,
	"location_address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_total_hours_non_negative" CHECK ("attendance"."total_hours" IS NULL OR "attendance"."total_hours" >= 0),
	CONSTRAINT "attendance_notes_length" CHECK ("attendance"."notes" IS NULL OR char_length("attendance"."notes") <= 500),
	CONSTRAINT "attendance_location_range" CHECK (("attendance"."location_latitude" IS NULL OR "attendance"."location_latitude" BETWEEN -90 AND 90) AND ("attendance"."location_longitude" IS NULL OR "attendance"."location_longitude" BETWEEN -180 AND 180))
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"service_name" text NOT NULL,
	"service_description" text,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"duration" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"staff_id" char(24),
	"staff_name" text,
	"notes" text,
	"reminder_sent" boolean DEFAULT false NOT NULL,
	"confirmation_sent" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" IN ('pending', 'confirmed', 'completed', 'cancelled', 'no-show')),
	CONSTRAINT "bookings_time_range_check" CHECK ("bookings"."end_time" > "bookings"."start_time"),
	CONSTRAINT "bookings_duration_check" CHECK ("bookings"."duration" >= 1),
	CONSTRAINT "bookings_customer_email_format" CHECK ("bookings"."customer_email" IS NULL OR "bookings"."customer_email" ~ '^\S+@\S+\.\S+$')
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_sessions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"user_id" char(24) NOT NULL,
	"opening_amount" numeric(14, 2) NOT NULL,
	"closing_amount" numeric(14, 2),
	"expected_amount" numeric(14, 2),
	"shortage" numeric(14, 2),
	"overage" numeric(14, 2),
	"opening_time" timestamp with time zone DEFAULT now() NOT NULL,
	"closing_time" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"total_vat" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total_discounts" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_sessions_status_check" CHECK ("cash_drawer_sessions"."status" IN ('open', 'closed')),
	CONSTRAINT "cash_drawer_sessions_amounts_non_negative" CHECK ("cash_drawer_sessions"."opening_amount" >= 0 AND ("cash_drawer_sessions"."closing_amount" IS NULL OR "cash_drawer_sessions"."closing_amount" >= 0) AND ("cash_drawer_sessions"."expected_amount" IS NULL OR "cash_drawer_sessions"."expected_amount" >= 0) AND ("cash_drawer_sessions"."shortage" IS NULL OR "cash_drawer_sessions"."shortage" >= 0) AND ("cash_drawer_sessions"."overage" IS NULL OR "cash_drawer_sessions"."overage" >= 0) AND "cash_drawer_sessions"."total_vat" >= 0 AND "cash_drawer_sessions"."total_discounts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_booking_templates" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"service_name" text NOT NULL,
	"service_description" text,
	"staff_id" char(24),
	"staff_name" text,
	"duration" integer NOT NULL,
	"start_time_hour" integer NOT NULL,
	"start_time_minute" integer NOT NULL,
	"recurrence_type" text NOT NULL,
	"days_of_week" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"day_of_month" integer,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_booking_templates_recurrence_type_check" CHECK ("recurring_booking_templates"."recurrence_type" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "recurring_booking_templates_days_of_week_check" CHECK ("recurring_booking_templates"."days_of_week" <@ ARRAY[0,1,2,3,4,5,6]),
	CONSTRAINT "recurring_booking_templates_time_check" CHECK ("recurring_booking_templates"."duration" >= 1 AND "recurring_booking_templates"."start_time_hour" BETWEEN 0 AND 23 AND "recurring_booking_templates"."start_time_minute" BETWEEN 0 AND 59),
	CONSTRAINT "recurring_booking_templates_day_of_month_check" CHECK ("recurring_booking_templates"."day_of_month" IS NULL OR "recurring_booking_templates"."day_of_month" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "z_readings" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"branch_id" char(24),
	"business_date" timestamp with time zone NOT NULL,
	"beginning_gt" numeric(14, 2) NOT NULL,
	"ending_gt" numeric(14, 2) NOT NULL,
	"gross_sales" numeric(14, 2) NOT NULL,
	"vatable_sales" numeric(14, 2) DEFAULT 0 NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"vat_exempt_sales" numeric(14, 2) DEFAULT 0 NOT NULL,
	"zero_rated_sales" numeric(14, 2) DEFAULT 0 NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"void_count" integer DEFAULT 0 NOT NULL,
	"generated_by" char(24) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "z_readings_tenant_branch_date_key" UNIQUE NULLS NOT DISTINCT("tenant_id","branch_id","business_date"),
	CONSTRAINT "z_readings_amounts_non_negative" CHECK ("z_readings"."beginning_gt" >= 0 AND "z_readings"."ending_gt" >= 0 AND "z_readings"."gross_sales" >= 0 AND "z_readings"."vatable_sales" >= 0 AND "z_readings"."vat_amount" >= 0 AND "z_readings"."vat_exempt_sales" >= 0 AND "z_readings"."zero_rated_sales" >= 0 AND "z_readings"."discount_total" >= 0 AND "z_readings"."transaction_count" >= 0 AND "z_readings"."void_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"subscription_id" char(24) NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"description" text,
	"notes" text,
	"transaction_id" text,
	"invoice_url" text,
	"recorded_by" char(24),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_type_check" CHECK ("billing_events"."type" IN ('invoice_created', 'payment_received', 'payment_failed', 'refund_issued', 'credit_applied', 'plan_changed', 'trial_started', 'trial_converted', 'trial_expired', 'subscription_cancelled', 'subscription_suspended', 'subscription_paused', 'subscription_resumed', 'manual_adjustment', 'invoice_generated', 'payment_overdue', 'late_fee_applied', 'reactivation_fee_applied', 'account_deactivated', 'account_reactivated'))
);
--> statement-breakpoint
CREATE TABLE "coupon_plans" (
	"coupon_id" char(24) NOT NULL,
	"plan_id" char(24) NOT NULL,
	CONSTRAINT "coupon_plans_coupon_id_plan_id_pk" PRIMARY KEY("coupon_id","plan_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" numeric(14, 2) NOT NULL,
	"applies_to" text DEFAULT 'all_plans' NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" char(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_discount_type_check" CHECK ("coupons"."discount_type" IN ('percentage', 'fixed')),
	CONSTRAINT "coupons_applies_to_check" CHECK ("coupons"."applies_to" IN ('all_plans', 'specific_plans')),
	CONSTRAINT "coupons_discount_value_non_negative" CHECK ("coupons"."discount_value" >= 0),
	CONSTRAINT "coupons_max_uses_check" CHECK ("coupons"."max_uses" IS NULL OR "coupons"."max_uses" >= 1),
	CONSTRAINT "coupons_used_count_non_negative" CHECK ("coupons"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"feature" text NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"granted_by" char(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_billing_history" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"subscription_id" char(24) NOT NULL,
	"position" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'PHP' NOT NULL,
	"status" text NOT NULL,
	"transaction_id" text,
	"invoice_url" text,
	CONSTRAINT "subscription_billing_history_status_check" CHECK ("subscription_billing_history"."status" IN ('paid', 'failed', 'pending', 'refunded')),
	CONSTRAINT "subscription_billing_history_amount_non_negative" CHECK ("subscription_billing_history"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"description" text,
	"price_monthly" numeric(14, 2) NOT NULL,
	"price_setup_fee" numeric(14, 2) DEFAULT 0 NOT NULL,
	"price_currency" text DEFAULT 'PHP' NOT NULL,
	"reactivation_fee" numeric(14, 2) DEFAULT 500 NOT NULL,
	"max_users" integer NOT NULL,
	"max_branches" integer NOT NULL,
	"max_products" integer NOT NULL,
	"max_transactions" integer NOT NULL,
	"feature_flags" jsonb NOT NULL,
	"bir_compliance" jsonb NOT NULL,
	"pharmacy_compliance" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"available_to_new_tenants" boolean DEFAULT true NOT NULL,
	"yearly_discount" numeric(12, 6) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_tier_check" CHECK ("subscription_plans"."tier" IN ('starter', 'pro', 'business', 'enterprise')),
	CONSTRAINT "subscription_plans_prices_non_negative" CHECK ("subscription_plans"."price_monthly" >= 0 AND "subscription_plans"."price_setup_fee" >= 0 AND "subscription_plans"."reactivation_fee" >= 0),
	CONSTRAINT "subscription_plans_max_users_check" CHECK ("subscription_plans"."max_users" = -1 OR "subscription_plans"."max_users" >= 1),
	CONSTRAINT "subscription_plans_max_branches_check" CHECK ("subscription_plans"."max_branches" = -1 OR "subscription_plans"."max_branches" >= 1),
	CONSTRAINT "subscription_plans_max_products_check" CHECK ("subscription_plans"."max_products" = -1 OR "subscription_plans"."max_products" >= 0),
	CONSTRAINT "subscription_plans_max_transactions_check" CHECK ("subscription_plans"."max_transactions" = -1 OR "subscription_plans"."max_transactions" >= 0),
	CONSTRAINT "subscription_plans_yearly_discount_check" CHECK ("subscription_plans"."yearly_discount" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"plan_id" char(24) NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"end_date" timestamp with time zone,
	"trial_end_date" timestamp with time zone,
	"next_billing_date" timestamp with time zone,
	"last_billing_date" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"suspended_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"pause_ends_at" timestamp with time zone,
	"grace_period_end_date" timestamp with time zone,
	"trial_converted_at" timestamp with time zone,
	"payment_overdue" boolean DEFAULT false NOT NULL,
	"outstanding_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"last_invoice_generated_at" timestamp with time zone,
	"late_fee_applied_at" timestamp with time zone,
	"reactivation_fee_applied_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"payment_method_type" text,
	"payment_method_last4" text,
	"payment_method_expiry_month" integer,
	"payment_method_expiry_year" integer,
	"payment_method_provider" text,
	"usage_current_users" integer DEFAULT 0 NOT NULL,
	"usage_current_branches" integer DEFAULT 1 NOT NULL,
	"usage_current_products" integer DEFAULT 0 NOT NULL,
	"usage_current_transactions" integer DEFAULT 0 NOT NULL,
	"usage_last_reset_date" timestamp with time zone DEFAULT now() NOT NULL,
	"is_trial" boolean DEFAULT true NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused')),
	CONSTRAINT "subscriptions_billing_cycle_check" CHECK ("subscriptions"."billing_cycle" IN ('monthly', 'yearly')),
	CONSTRAINT "subscriptions_payment_method_type_check" CHECK ("subscriptions"."payment_method_type" IS NULL OR "subscriptions"."payment_method_type" IN ('card', 'bank', 'paypal', 'manual')),
	CONSTRAINT "subscriptions_payment_method_expiry_check" CHECK (("subscriptions"."payment_method_expiry_month" IS NULL OR "subscriptions"."payment_method_expiry_month" BETWEEN 1 AND 12) AND ("subscriptions"."payment_method_expiry_year" IS NULL OR "subscriptions"."payment_method_expiry_year" BETWEEN 2024 AND 2050)),
	CONSTRAINT "subscriptions_outstanding_balance_non_negative" CHECK ("subscriptions"."outstanding_balance" >= 0),
	CONSTRAINT "subscriptions_usage_check" CHECK ("subscriptions"."usage_current_users" >= 0 AND "subscriptions"."usage_current_branches" >= 1 AND "subscriptions"."usage_current_products" >= 0 AND "subscriptions"."usage_current_transactions" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tenant_ecommerce_integrations" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"provider" text NOT NULL,
	"shop_domain" text,
	"site_url" text,
	"credentials_encrypted" text NOT NULL,
	"webhook_secret_encrypted" text,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"shopify_location_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"default_branch_id" char(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_ecommerce_integrations_provider_check" CHECK ("tenant_ecommerce_integrations"."provider" IN ('shopify', 'woocommerce'))
);
--> statement-breakpoint
CREATE TABLE "archived_audit_logs" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"user_id" char(24),
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"user_id" char(24),
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"tenant_id" char(24) NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"size" bigint NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"uploaded_by" char(24) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"reason" text DEFAULT 'logout' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_actions" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"admin_user_id" char(24) NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"description" text,
	"changes" jsonb,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_revocations" (
	"id" char(24) PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"revoked_before" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_current_order_id_transactions_id_fk" FOREIGN KEY ("current_order_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_branch_stock" ADD CONSTRAINT "product_branch_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_bundle_id_product_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."product_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundle_items" ADD CONSTRAINT "product_bundle_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bundles" ADD CONSTRAINT "product_bundles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_channel_listings" ADD CONSTRAINT "product_channel_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_categories" ADD CONSTRAINT "tax_rule_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_categories" ADD CONSTRAINT "tax_rule_categories_tax_rule_id_tax_rules_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_categories" ADD CONSTRAINT "tax_rule_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_products" ADD CONSTRAINT "tax_rule_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_products" ADD CONSTRAINT "tax_rule_products_tax_rule_id_tax_rules_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_products" ADD CONSTRAINT "tax_rule_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transaction_items" ADD CONSTRAINT "offline_transaction_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transaction_items" ADD CONSTRAINT "offline_transaction_items_offline_transaction_id_offline_transactions_id_fk" FOREIGN KEY ("offline_transaction_id") REFERENCES "public"."offline_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transaction_items" ADD CONSTRAINT "offline_transaction_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_transactions" ADD CONSTRAINT "offline_transactions_synced_transaction_id_transactions_id_fk" FOREIGN KEY ("synced_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sessions" ADD CONSTRAINT "pos_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensed_by_users_id_fk" FOREIGN KEY ("dispensed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_dispensed_transaction_id_transactions_id_fk" FOREIGN KEY ("dispensed_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cart_items" ADD CONSTRAINT "saved_cart_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cart_items" ADD CONSTRAINT "saved_cart_items_saved_cart_id_saved_carts_id_fk" FOREIGN KEY ("saved_cart_id") REFERENCES "public"."saved_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cart_items" ADD CONSTRAINT "saved_cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_carts" ADD CONSTRAINT "saved_carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_split_payments" ADD CONSTRAINT "transaction_split_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_split_payments" ADD CONSTRAINT "transaction_split_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_balance_payments" ADD CONSTRAINT "customer_balance_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_configs" ADD CONSTRAINT "loyalty_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_sessions" ADD CONSTRAINT "cash_drawer_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_booking_templates" ADD CONSTRAINT "recurring_booking_templates_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "z_readings" ADD CONSTRAINT "z_readings_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_billing_history" ADD CONSTRAINT "subscription_billing_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_billing_history" ADD CONSTRAINT "subscription_billing_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_ecommerce_integrations" ADD CONSTRAINT "tenant_ecommerce_integrations_default_branch_id_branches_id_fk" FOREIGN KEY ("default_branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_audit_logs" ADD CONSTRAINT "archived_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_audit_logs" ADD CONSTRAINT "archived_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_actions" ADD CONSTRAINT "super_admin_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants" USING btree ("domain") WHERE "tenants"."domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants" USING btree ("subdomain") WHERE "tenants"."subdomain" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tenants_is_active_idx" ON "tenants" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_qr_token_key" ON "users" USING btree ("qr_token") WHERE "users"."qr_token" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_tenant_role_active_idx" ON "users" USING btree ("tenant_id","role","is_active");--> statement-breakpoint
CREATE INDEX "users_tenant_branch_active_idx" ON "users" USING btree ("tenant_id","branch_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_tenant_code_key" ON "branches" USING btree ("tenant_id","code") WHERE "branches"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "branches_tenant_active_idx" ON "branches" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_tenant_terminal_id_key" ON "devices" USING btree ("tenant_id","terminal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_tenant_serial_number_key" ON "devices" USING btree ("tenant_id","serial_number");--> statement-breakpoint
CREATE INDEX "devices_tenant_active_idx" ON "devices" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "dining_tables_tenant_active_status_idx" ON "dining_tables" USING btree ("tenant_id","is_active","status");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_tenant_name_key" ON "dining_tables" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "expenses_tenant_date_idx" ON "expenses" USING btree ("tenant_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_tenant_name_idx" ON "expenses" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_name_key" ON "categories" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "product_branch_stock_tenant_branch_idx" ON "product_branch_stock" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "product_bundle_items_bundle_position_idx" ON "product_bundle_items" USING btree ("bundle_id","position");--> statement-breakpoint
CREATE INDEX "product_bundle_items_product_idx" ON "product_bundle_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_bundles_tenant_sku_key" ON "product_bundles" USING btree ("tenant_id","sku") WHERE "product_bundles"."sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "product_bundles_tenant_active_idx" ON "product_bundles" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "product_bundles_category_id_idx" ON "product_bundles" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_channel_listings_tenant_provider_variant_key" ON "product_channel_listings" USING btree ("tenant_id","provider","external_variant_id");--> statement-breakpoint
CREATE INDEX "product_channel_listings_tenant_product_provider_idx" ON "product_channel_listings" USING btree ("tenant_id","product_id","provider");--> statement-breakpoint
CREATE INDEX "product_variations_product_position_idx" ON "product_variations" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "product_variations_tenant_sku_idx" ON "product_variations" USING btree ("tenant_id","sku") WHERE "product_variations"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_key" ON "products" USING btree ("tenant_id","sku") WHERE "products"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_barcode_key" ON "products" USING btree ("tenant_id","barcode") WHERE "products"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "products_tenant_type_track_idx" ON "products" USING btree ("tenant_id","product_type","track_inventory");--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "products_tenant_active_pinned_created_idx" ON "products" USING btree ("tenant_id","is_active","pinned" DESC NULLS LAST,"created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "products_tenant_expiry_date_idx" ON "products" USING btree ("tenant_id","expiry_date");--> statement-breakpoint
CREATE INDEX "products_tenant_drug_schedule_idx" ON "products" USING btree ("tenant_id","drug_schedule");--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_sku_trgm_idx" ON "products" USING gin ("sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_barcode_trgm_idx" ON "products" USING gin ("barcode" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tax_rule_categories_category_idx" ON "tax_rule_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "tax_rule_products_product_idx" ON "tax_rule_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "tax_rules_tenant_active_priority_idx" ON "tax_rules" USING btree ("tenant_id","is_active","priority" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tax_rules_tenant_applies_to_active_idx" ON "tax_rules" USING btree ("tenant_id","applies_to","is_active");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_position_idx" ON "invoice_items" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_invoice_number_key" ON "invoices" USING btree ("tenant_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_tenant_created_idx" ON "invoices" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoices_tenant_status_due_date_idx" ON "invoices" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_tenant_customer_idx" ON "invoices" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_transaction_idx" ON "invoices" USING btree ("tenant_id","transaction_id");--> statement-breakpoint
CREATE INDEX "offline_transaction_items_parent_position_idx" ON "offline_transaction_items" USING btree ("offline_transaction_id","position");--> statement-breakpoint
CREATE INDEX "offline_transactions_tenant_sync_status_idx" ON "offline_transactions" USING btree ("tenant_id","sync_status");--> statement-breakpoint
CREATE INDEX "offline_transactions_tenant_device_offline_created_idx" ON "offline_transactions" USING btree ("tenant_id","device_id","offline_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "offline_transactions_tenant_created_idx" ON "offline_transactions" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "offline_transactions_synced_updated_at_idx" ON "offline_transactions" USING btree ("updated_at") WHERE "offline_transactions"."sync_status" = 'synced';--> statement-breakpoint
CREATE INDEX "payments_tenant_created_idx" ON "payments" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_tenant_transaction_idx" ON "payments" USING btree ("tenant_id","transaction_id");--> statement-breakpoint
CREATE INDEX "payments_tenant_status_created_idx" ON "payments" USING btree ("tenant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_tenant_method_created_idx" ON "payments" USING btree ("tenant_id","method","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payments_tenant_status_method_created_idx" ON "payments" USING btree ("tenant_id","status","method","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pos_sessions_session_id_key" ON "pos_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pos_sessions_updated_at_idx" ON "pos_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "prescription_items_prescription_position_idx" ON "prescription_items" USING btree ("prescription_id","position");--> statement-breakpoint
CREATE INDEX "prescriptions_tenant_created_idx" ON "prescriptions" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prescriptions_tenant_status_created_idx" ON "prescriptions" USING btree ("tenant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "prescriptions_tenant_prescription_number_key" ON "prescriptions" USING btree ("tenant_id","prescription_number");--> statement-breakpoint
CREATE INDEX "prescriptions_tenant_valid_until_idx" ON "prescriptions" USING btree ("tenant_id","valid_until");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_name_trgm_idx" ON "prescriptions" USING gin ("patient_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "saved_cart_items_cart_position_idx" ON "saved_cart_items" USING btree ("saved_cart_id","position");--> statement-breakpoint
CREATE INDEX "saved_cart_items_tenant_product_idx" ON "saved_cart_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "saved_carts_tenant_user_created_idx" ON "saved_carts" USING btree ("tenant_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "saved_carts_inactive_updated_at_idx" ON "saved_carts" USING btree ("updated_at") WHERE "saved_carts"."is_active" = false;--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_created_idx" ON "stock_movements" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_product_created_idx" ON "stock_movements" USING btree ("tenant_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_branch_product_created_idx" ON "stock_movements" USING btree ("tenant_id","branch_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_type_created_idx" ON "stock_movements" USING btree ("tenant_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transaction_items_transaction_position_idx" ON "transaction_items" USING btree ("transaction_id","position");--> statement-breakpoint
CREATE INDEX "transaction_items_tenant_product_idx" ON "transaction_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "transaction_split_payments_transaction_position_idx" ON "transaction_split_payments" USING btree ("transaction_id","position");--> statement-breakpoint
CREATE INDEX "transactions_tenant_created_idx" ON "transactions" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_tenant_active_created_idx" ON "transactions" USING btree ("tenant_id","is_active","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_tenant_branch_created_idx" ON "transactions" USING btree ("tenant_id","branch_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_tenant_status_created_idx" ON "transactions" USING btree ("tenant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_tenant_customer_created_idx" ON "transactions" USING btree ("tenant_id","customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_tenant_user_created_idx" ON "transactions" USING btree ("tenant_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_receipt_number_key" ON "transactions" USING btree ("tenant_id","receipt_number") WHERE "transactions"."receipt_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_idempotency_key_key" ON "transactions" USING btree ("tenant_id","idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_tenant_channel_sync_key_key" ON "transactions" USING btree ("tenant_id","channel_sync_key") WHERE "transactions"."channel_sync_key" IS NOT NULL AND "transactions"."channel_sync_key" <> '';--> statement-breakpoint
CREATE INDEX "addresses_tenant_user_idx" ON "addresses" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "campaigns_tenant_status_created_at_idx" ON "campaigns" USING btree ("tenant_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customer_balance_payments_tenant_customer_created_at_idx" ON "customer_balance_payments" USING btree ("tenant_id","customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_balance_payments_tenant_idempotency_key_key" ON "customer_balance_payments" USING btree ("tenant_id","idempotency_key") WHERE "customer_balance_payments"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_otps_tenant_phone_verified_idx" ON "customer_otps" USING btree ("tenant_id","phone","verified");--> statement-breakpoint
CREATE INDEX "customer_otps_expires_at_idx" ON "customer_otps" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_email_key" ON "customers" USING btree ("tenant_id","email") WHERE "customers"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_tenant_phone_idx" ON "customers" USING btree ("tenant_id","phone") WHERE "customers"."phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_tenant_shopify_customer_id_idx" ON "customers" USING btree ("tenant_id","shopify_customer_id") WHERE "customers"."shopify_customer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_tenant_created_at_idx" ON "customers" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_first_name_trgm_idx" ON "customers" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customers_last_name_trgm_idx" ON "customers" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customers_email_trgm_idx" ON "customers" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "customers_phone_trgm_idx" ON "customers" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_tenant_code_key" ON "discounts" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "discounts_tenant_active_valid_idx" ON "discounts" USING btree ("tenant_id","is_active","valid_from","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_configs_tenant_id_key" ON "loyalty_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "loyalty_transactions_tenant_customer_created_at_idx" ON "loyalty_transactions" USING btree ("tenant_id","customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "loyalty_transactions_tenant_transaction_idx" ON "loyalty_transactions" USING btree ("tenant_id","transaction_id");--> statement-breakpoint
CREATE INDEX "attendance_tenant_user_clock_in_idx" ON "attendance" USING btree ("tenant_id","user_id","clock_in" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "attendance_tenant_clock_in_idx" ON "attendance" USING btree ("tenant_id","clock_in" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_open_shift_key" ON "attendance" USING btree ("tenant_id","user_id") WHERE "attendance"."clock_out" IS NULL;--> statement-breakpoint
CREATE INDEX "attendance_tenant_open_idx" ON "attendance" USING btree ("tenant_id") WHERE "attendance"."clock_out" IS NULL;--> statement-breakpoint
CREATE INDEX "bookings_tenant_start_time_idx" ON "bookings" USING btree ("tenant_id","start_time");--> statement-breakpoint
CREATE INDEX "bookings_tenant_staff_start_time_idx" ON "bookings" USING btree ("tenant_id","staff_id","start_time");--> statement-breakpoint
CREATE INDEX "bookings_tenant_status_start_time_idx" ON "bookings" USING btree ("tenant_id","status","start_time");--> statement-breakpoint
CREATE INDEX "bookings_tenant_customer_email_start_time_idx" ON "bookings" USING btree ("tenant_id","customer_email","start_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bookings_tenant_customer_phone_idx" ON "bookings" USING btree ("tenant_id","customer_phone");--> statement-breakpoint
CREATE INDEX "cash_drawer_sessions_tenant_opening_time_idx" ON "cash_drawer_sessions" USING btree ("tenant_id","opening_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cash_drawer_sessions_tenant_user_status_idx" ON "cash_drawer_sessions" USING btree ("tenant_id","user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawer_sessions_open_key" ON "cash_drawer_sessions" USING btree ("tenant_id") WHERE "cash_drawer_sessions"."status" = 'open';--> statement-breakpoint
CREATE INDEX "recurring_booking_templates_tenant_active_idx" ON "recurring_booking_templates" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "recurring_booking_templates_tenant_staff_active_idx" ON "recurring_booking_templates" USING btree ("tenant_id","staff_id","is_active");--> statement-breakpoint
CREATE INDEX "recurring_booking_templates_tenant_recurrence_active_idx" ON "recurring_booking_templates" USING btree ("tenant_id","recurrence_type","is_active");--> statement-breakpoint
CREATE INDEX "z_readings_tenant_business_date_idx" ON "z_readings" USING btree ("tenant_id","business_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "billing_events_tenant_created_at_idx" ON "billing_events" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_tenant_transaction_id_key" ON "billing_events" USING btree ("tenant_id","transaction_id") WHERE "billing_events"."transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "coupon_plans_plan_id_idx" ON "coupon_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_active_valid_from_valid_until_idx" ON "coupons" USING btree ("is_active","valid_from","valid_until");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_overrides_tenant_feature_key" ON "feature_flag_overrides" USING btree ("tenant_id","feature");--> statement-breakpoint
CREATE INDEX "feature_flag_overrides_expires_at_idx" ON "feature_flag_overrides" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_billing_history_subscription_position_key" ON "subscription_billing_history" USING btree ("subscription_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_tier_key" ON "subscription_plans" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_next_billing_date_idx" ON "subscriptions" USING btree ("status","next_billing_date");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_status_idx" ON "subscriptions" USING btree ("plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_ecommerce_integrations_tenant_provider_key" ON "tenant_ecommerce_integrations" USING btree ("tenant_id","provider");--> statement-breakpoint
CREATE INDEX "tenant_ecommerce_integrations_shop_domain_idx" ON "tenant_ecommerce_integrations" USING btree ("shop_domain") WHERE "tenant_ecommerce_integrations"."shop_domain" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tenant_ecommerce_integrations_site_url_tenant_idx" ON "tenant_ecommerce_integrations" USING btree ("site_url","tenant_id") WHERE "tenant_ecommerce_integrations"."site_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "archived_audit_logs_tenant_created_at_idx" ON "archived_audit_logs" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_at_idx" ON "audit_logs" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_user_created_at_idx" ON "audit_logs" USING btree ("tenant_id","user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_entity_idx" ON "audit_logs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "files_tenant_uploaded_at_idx" ON "files" USING btree ("tenant_id","uploaded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "revoked_tokens_token_hash_key" ON "revoked_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "revoked_tokens_expires_at_idx" ON "revoked_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "super_admin_actions_action_idx" ON "super_admin_actions" USING btree ("action");--> statement-breakpoint
CREATE INDEX "super_admin_actions_admin_created_at_idx" ON "super_admin_actions" USING btree ("admin_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "super_admin_actions_created_at_idx" ON "super_admin_actions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "super_admin_actions_target_idx" ON "super_admin_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_revocations_user_id_key" ON "user_revocations" USING btree ("user_id");