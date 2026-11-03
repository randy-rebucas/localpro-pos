/**
 * Billing domain: plans, per-tenant subscriptions (+ billing history), billing
 * events, coupons, feature-flag overrides and e-commerce channel integrations.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { id, money, objectId, rate, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';
import { branches } from './org';

export const SUBSCRIPTION_TIERS = ['starter', 'pro', 'business', 'enterprise'] as const;

/** Boolean feature switches of a plan. Limits are separate integer columns. */
export type SubscriptionPlanFeatureFlags = {
  enableInventory: boolean;
  enableCategories: boolean;
  enableDiscounts: boolean;
  enableLoyaltyProgram: boolean;
  enableCustomerManagement: boolean;
  enableBookingScheduling: boolean;
  enableTableManagement: boolean;
  enableReports: boolean;
  enableMultiBranch: boolean;
  enableHardwareIntegration: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  dedicatedAccountManager: boolean;
};

export type SubscriptionPlanBirCompliance = {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
};

export type SubscriptionPlanPharmacyCompliance = {
  enablePharmacyCompliance: boolean;
  prescriptionManagement: boolean;
  expiryTracking: boolean;
  pdeaReporting: boolean;
};

// models/SubscriptionPlan.ts
// Repository: invalidateSubscriptionCache() after every write; delete guard
// (no active/trial subscriptions on the plan) — the FK from subscriptions.plan_id
// additionally blocks deleting any referenced plan.
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: id(),
    name: text('name').notNull(),
    tier: text('tier', { enum: SUBSCRIPTION_TIERS }).notNull(),
    description: text('description'),
    // price.* sorted on (price.monthly) → flat columns
    priceMonthly: money('price_monthly').notNull(),
    priceSetupFee: money('price_setup_fee').notNull().default(0),
    priceCurrency: text('price_currency').notNull().default('PHP'),
    reactivationFee: money('reactivation_fee').notNull().default(500),
    // features.max* are numeric limits with validators → flat columns with CHECKs (-1 = unlimited)
    maxUsers: integer('max_users').notNull(),
    maxBranches: integer('max_branches').notNull(),
    maxProducts: integer('max_products').notNull(),
    maxTransactions: integer('max_transactions').notNull(),
    // The boolean features.* / birCompliance.* / pharmacyCompliance.* flags are
    // never filtered on in queries (always read with the whole plan) → JSONB.
    // Mongoose per-flag defaults are applied by the repository on create.
    featureFlags: jsonb('feature_flags').$type<SubscriptionPlanFeatureFlags>().notNull(),
    birCompliance: jsonb('bir_compliance').$type<SubscriptionPlanBirCompliance>().notNull(),
    pharmacyCompliance: jsonb('pharmacy_compliance').$type<SubscriptionPlanPharmacyCompliance>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    isCustom: boolean('is_custom').notNull().default(false),
    availableToNewTenants: boolean('available_to_new_tenants').notNull().default(true),
    // Percent, 0–100
    yearlyDiscount: rate('yearly_discount').notNull().default(0),
    ...timestamps(),
  },
  t => [
    uniqueIndex('subscription_plans_tier_key').on(t.tier),
    index('subscription_plans_is_active_idx').on(t.isActive),
    check('subscription_plans_tier_check', sql`${t.tier} IN ('starter', 'pro', 'business', 'enterprise')`),
    check(
      'subscription_plans_prices_non_negative',
      sql`${t.priceMonthly} >= 0 AND ${t.priceSetupFee} >= 0 AND ${t.reactivationFee} >= 0`
    ),
    check('subscription_plans_max_users_check', sql`${t.maxUsers} = -1 OR ${t.maxUsers} >= 1`),
    check('subscription_plans_max_branches_check', sql`${t.maxBranches} = -1 OR ${t.maxBranches} >= 1`),
    check('subscription_plans_max_products_check', sql`${t.maxProducts} = -1 OR ${t.maxProducts} >= 0`),
    check('subscription_plans_max_transactions_check', sql`${t.maxTransactions} = -1 OR ${t.maxTransactions} >= 0`),
    check('subscription_plans_yearly_discount_check', sql`${t.yearlyDiscount} BETWEEN 0 AND 100`),
  ]
);

export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused'] as const;
export const BILLING_CYCLES = ['monthly', 'yearly'] as const;
export const PAYMENT_METHOD_TYPES = ['card', 'bank', 'paypal', 'manual'] as const;

// models/Subscription.ts
// Repository: isExpired / isTrialExpired / canUseFeature / checkLimits helpers;
// invalidateSubscriptionCache() on writes, except usage_*-only updates.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: tenantId(),
    planId: objectId('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull().default('trial'),
    billingCycle: text('billing_cycle', { enum: BILLING_CYCLES }).notNull().default('monthly'),
    startDate: timestamptz('start_date').notNull().defaultNow(),
    endDate: timestamptz('end_date'),
    trialEndDate: timestamptz('trial_end_date'),
    nextBillingDate: timestamptz('next_billing_date'),
    lastBillingDate: timestamptz('last_billing_date'),
    cancelledAt: timestamptz('cancelled_at'),
    cancellationReason: text('cancellation_reason'),
    suspendedAt: timestamptz('suspended_at'),
    pausedAt: timestamptz('paused_at'),
    pauseReason: text('pause_reason'),
    pauseEndsAt: timestamptz('pause_ends_at'),
    gracePeriodEndDate: timestamptz('grace_period_end_date'),
    trialConvertedAt: timestamptz('trial_converted_at'),
    paymentOverdue: boolean('payment_overdue').notNull().default(false),
    outstandingBalance: money('outstanding_balance').notNull().default(0),
    lastInvoiceGeneratedAt: timestamptz('last_invoice_generated_at'),
    lateFeeAppliedAt: timestamptz('late_fee_applied_at'),
    reactivationFeeAppliedAt: timestamptz('reactivation_fee_applied_at'),
    deactivatedAt: timestamptz('deactivated_at'),
    // paymentMethod is optional as a whole → every column nullable
    paymentMethodType: text('payment_method_type', { enum: PAYMENT_METHOD_TYPES }),
    paymentMethodLast4: text('payment_method_last4'),
    paymentMethodExpiryMonth: integer('payment_method_expiry_month'),
    paymentMethodExpiryYear: integer('payment_method_expiry_year'),
    paymentMethodProvider: text('payment_method_provider'),
    usageCurrentUsers: integer('usage_current_users').notNull().default(0),
    usageCurrentBranches: integer('usage_current_branches').notNull().default(1),
    usageCurrentProducts: integer('usage_current_products').notNull().default(0),
    usageCurrentTransactions: integer('usage_current_transactions').notNull().default(0),
    usageLastResetDate: timestamptz('usage_last_reset_date').notNull().defaultNow(),
    isTrial: boolean('is_trial').notNull().default(true),
    autoRenew: boolean('auto_renew').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    // One subscription per tenant
    uniqueIndex('subscriptions_tenant_id_key').on(t.tenantId),
    // Mongo {status} is a prefix of this index, so it is not repeated
    index('subscriptions_status_next_billing_date_idx').on(t.status, t.nextBillingDate),
    index('subscriptions_plan_status_idx').on(t.planId, t.status),
    check(
      'subscriptions_status_check',
      sql`${t.status} IN ('active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused')`
    ),
    check('subscriptions_billing_cycle_check', sql`${t.billingCycle} IN ('monthly', 'yearly')`),
    check(
      'subscriptions_payment_method_type_check',
      sql`${t.paymentMethodType} IS NULL OR ${t.paymentMethodType} IN ('card', 'bank', 'paypal', 'manual')`
    ),
    check(
      'subscriptions_payment_method_expiry_check',
      sql`(${t.paymentMethodExpiryMonth} IS NULL OR ${t.paymentMethodExpiryMonth} BETWEEN 1 AND 12) AND (${t.paymentMethodExpiryYear} IS NULL OR ${t.paymentMethodExpiryYear} BETWEEN 2024 AND 2050)`
    ),
    check('subscriptions_outstanding_balance_non_negative', sql`${t.outstandingBalance} >= 0`),
    check(
      'subscriptions_usage_check',
      sql`${t.usageCurrentUsers} >= 0 AND ${t.usageCurrentBranches} >= 1 AND ${t.usageCurrentProducts} >= 0 AND ${t.usageCurrentTransactions} >= 0`
    ),
  ]
);

export const BILLING_HISTORY_STATUSES = ['paid', 'failed', 'pending', 'refunded'] as const;

// models/Subscription.ts — billingHistory[] subdocuments (id = subdoc _id)
export const subscriptionBillingHistory = pgTable(
  'subscription_billing_history',
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: objectId('subscription_id')
      .notNull()
      .references((): AnyPgColumn => subscriptions.id, { onDelete: 'cascade' }),
    // Array order in Mongo
    position: integer('position').notNull(),
    date: timestamptz('date').notNull(),
    amount: money('amount').notNull(),
    currency: text('currency').notNull().default('PHP'),
    status: text('status', { enum: BILLING_HISTORY_STATUSES }).notNull(),
    // External payment-provider id, not a row reference
    transactionId: text('transaction_id'),
    invoiceUrl: text('invoice_url'),
  },
  t => [
    uniqueIndex('subscription_billing_history_subscription_position_key').on(t.subscriptionId, t.position),
    check('subscription_billing_history_status_check', sql`${t.status} IN ('paid', 'failed', 'pending', 'refunded')`),
    check('subscription_billing_history_amount_non_negative', sql`${t.amount} >= 0`),
  ]
);

export const BILLING_EVENT_TYPES = [
  'invoice_created',
  'payment_received',
  'payment_failed',
  'refund_issued',
  'credit_applied',
  'plan_changed',
  'trial_started',
  'trial_converted',
  'trial_expired',
  'subscription_cancelled',
  'subscription_suspended',
  'subscription_paused',
  'subscription_resumed',
  'manual_adjustment',
  'invoice_generated',
  'payment_overdue',
  'late_fee_applied',
  'reactivation_fee_applied',
  'account_deactivated',
  'account_reactivated',
] as const;

// models/BillingEvent.ts
export const billingEvents = pgTable(
  'billing_events',
  {
    id: id(),
    tenantId: tenantId(),
    subscriptionId: objectId('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    type: text('type', { enum: BILLING_EVENT_TYPES }).notNull(),
    // Signed: refunds/credits may be negative (no min in Mongo)
    amount: money('amount').notNull(),
    currency: text('currency').notNull().default('PHP'),
    description: text('description'),
    notes: text('notes'),
    // External payment-provider id (e.g. PayPal capture), not a row reference
    transactionId: text('transaction_id'),
    invoiceUrl: text('invoice_url'),
    recordedBy: objectId('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ...timestamps(),
  },
  t => [
    index('billing_events_tenant_created_at_idx').on(t.tenantId, t.createdAt.desc()),
    // Prevents double-recording the same payment
    uniqueIndex('billing_events_tenant_transaction_id_key')
      .on(t.tenantId, t.transactionId)
      .where(sql`${t.transactionId} IS NOT NULL`),
    check(
      'billing_events_type_check',
      sql`${t.type} IN ('invoice_created', 'payment_received', 'payment_failed', 'refund_issued', 'credit_applied', 'plan_changed', 'trial_started', 'trial_converted', 'trial_expired', 'subscription_cancelled', 'subscription_suspended', 'subscription_paused', 'subscription_resumed', 'manual_adjustment', 'invoice_generated', 'payment_overdue', 'late_fee_applied', 'reactivation_fee_applied', 'account_deactivated', 'account_reactivated')`
    ),
  ]
);

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export const COUPON_APPLIES_TO = ['all_plans', 'specific_plans'] as const;

// models/Coupon.ts
export const coupons = pgTable(
  'coupons',
  {
    id: id(),
    // Uppercased + trimmed by the repository layer
    code: text('code').notNull(),
    description: text('description'),
    discountType: text('discount_type', { enum: COUPON_DISCOUNT_TYPES }).notNull(),
    // Percent or currency amount depending on discount_type
    discountValue: money('discount_value').notNull(),
    appliesTo: text('applies_to', { enum: COUPON_APPLIES_TO }).notNull().default('all_plans'),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    validFrom: timestamptz('valid_from').notNull().defaultNow(),
    validUntil: timestamptz('valid_until'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: objectId('created_by')
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  t => [
    uniqueIndex('coupons_code_key').on(t.code),
    index('coupons_active_valid_from_valid_until_idx').on(t.isActive, t.validFrom, t.validUntil),
    check('coupons_discount_type_check', sql`${t.discountType} IN ('percentage', 'fixed')`),
    check('coupons_applies_to_check', sql`${t.appliesTo} IN ('all_plans', 'specific_plans')`),
    check('coupons_discount_value_non_negative', sql`${t.discountValue} >= 0`),
    check('coupons_max_uses_check', sql`${t.maxUses} IS NULL OR ${t.maxUses} >= 1`),
    check('coupons_used_count_non_negative', sql`${t.usedCount} >= 0`),
  ]
);

// models/Coupon.ts — planIds[]
export const couponPlans = pgTable(
  'coupon_plans',
  {
    couponId: objectId('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'cascade' }),
    // Cascade: Mongo let a plan be deleted while coupons still listed it
    planId: objectId('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.couponId, t.planId] }), index('coupon_plans_plan_id_idx').on(t.planId)]
);

// models/FeatureFlagOverride.ts
export const featureFlagOverrides = pgTable(
  'feature_flag_overrides',
  {
    id: id(),
    tenantId: tenantId(),
    feature: text('feature').notNull(),
    enabled: boolean('enabled').notNull(),
    reason: text('reason'),
    // Null = permanent override
    expiresAt: timestamptz('expires_at'),
    grantedBy: objectId('granted_by')
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  t => [
    uniqueIndex('feature_flag_overrides_tenant_feature_key').on(t.tenantId, t.feature),
    // TTL in Mongo — enforced by lib/automations/ttl-cleanup.ts
    index('feature_flag_overrides_expires_at_idx').on(t.expiresAt),
  ]
);

export const ECOMMERCE_PROVIDERS = ['shopify', 'woocommerce'] as const;

// models/TenantEcommerceIntegration.ts
// Repository: invalidateTenantCache() after every write.
export const tenantEcommerceIntegrations = pgTable(
  'tenant_ecommerce_integrations',
  {
    id: id(),
    tenantId: tenantId(),
    provider: text('provider', { enum: ECOMMERCE_PROVIDERS }).notNull(),
    // Lowercased + trimmed by the repository layer
    shopDomain: text('shop_domain'),
    siteUrl: text('site_url'),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    webhookSecretEncrypted: text('webhook_secret_encrypted'),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    shopifyLocationId: text('shopify_location_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastSyncAt: timestamptz('last_sync_at'),
    lastError: text('last_error'),
    defaultBranchId: objectId('default_branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  t => [
    uniqueIndex('tenant_ecommerce_integrations_tenant_provider_key').on(t.tenantId, t.provider),
    // Sparse in Mongo (webhook lookup by shop, cross-tenant)
    index('tenant_ecommerce_integrations_shop_domain_idx').on(t.shopDomain).where(sql`${t.shopDomain} IS NOT NULL`),
    index('tenant_ecommerce_integrations_site_url_tenant_idx')
      .on(t.siteUrl, t.tenantId)
      .where(sql`${t.siteUrl} IS NOT NULL`),
    check('tenant_ecommerce_integrations_provider_check', sql`${t.provider} IN ('shopify', 'woocommerce')`),
  ]
);
