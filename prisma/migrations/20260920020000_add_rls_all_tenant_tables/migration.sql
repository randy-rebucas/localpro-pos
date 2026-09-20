-- Enables RLS (with the same tenant/bypass policy shape as products, see
-- 20260920000000_add_rls_products and 20260920010000_rls_bypass_clause)
-- on every remaining tenant-scoped table. Defense-in-depth only: the
-- application's existing `tenantId: user.tenantId` filters in every route
-- are unchanged. Enforcement is automatic via the Prisma client extension
-- in lib/db.ts (TENANT_SCOPED_MODELS) plus the AsyncLocalStorage context
-- set in lib/auth.ts / lib/auth-customer.ts / lib/automation-auth.ts /
-- lib/cron.ts / lib/script-runtime.ts / the webhook and OAuth routes.

ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_settings ON "tenant_settings"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_role_permission_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_role_permission_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_role_permission_overrides ON "tenant_role_permission_overrides"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_practitioner_licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_practitioner_licenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_practitioner_licenses ON "tenant_practitioner_licenses"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_exchange_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_exchange_rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_exchange_rates ON "tenant_exchange_rates"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_theme_variables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_theme_variables" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_theme_variables ON "tenant_theme_variables"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_receipt_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_receipt_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_receipt_templates ON "tenant_receipt_templates"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_business_hours" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_business_hours ON "tenant_business_hours"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_special_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_special_hours" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_special_hours ON "tenant_special_hours"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_holidays" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_holidays ON "tenant_holidays"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON "users"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "addresses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_addresses ON "addresses"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_branches ON "branches"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_devices ON "devices"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_categories ON "categories"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "product_bundles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_bundles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_product_bundles ON "product_bundles"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "product_channel_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_channel_listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_product_channel_listings ON "product_channel_listings"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tenant_ecommerce_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_ecommerce_integrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenant_ecommerce_integrations ON "tenant_ecommerce_integrations"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customers ON "customers"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "customer_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_otps" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customer_otps ON "customer_otps"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "customer_balance_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_balance_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_customer_balance_payments ON "customer_balance_payments"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_campaigns ON "campaigns"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_subscriptions ON "subscriptions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_billing_events ON "billing_events"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "feature_flag_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_flag_overrides" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_feature_flag_overrides ON "feature_flag_overrides"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "cash_drawer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_drawer_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cash_drawer_sessions ON "cash_drawer_sessions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_discounts ON "discounts"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_expenses ON "expenses"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_files ON "files"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_invoices ON "invoices"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "loyalty_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_loyalty_configs ON "loyalty_configs"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "loyalty_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_loyalty_transactions ON "loyalty_transactions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "offline_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offline_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_offline_transactions ON "offline_transactions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payments ON "payments"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_prescriptions ON "prescriptions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "recurring_booking_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_booking_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_recurring_booking_templates ON "recurring_booking_templates"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "saved_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_carts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_saved_carts ON "saved_carts"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_movements ON "stock_movements"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_counters ON "counters"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "tax_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tax_rules ON "tax_rules"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "pos_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_tables" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pos_tables ON "pos_tables"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "z_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "z_readings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_z_readings ON "z_readings"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "attendances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_attendances ON "attendances"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bookings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_bookings ON "bookings"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_transactions ON "transactions"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_logs ON "audit_logs"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

ALTER TABLE "archived_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "archived_audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_archived_audit_logs ON "archived_audit_logs"
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );
