/**
 * Customers and CRM: customers, client-portal addresses, OTP login codes,
 * on-account payments, loyalty, marketing campaigns and discount codes.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { CustomerAddress } from '@/types/customer';
import { id, money, objectId, rate, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';
import { transactions } from './sales';

// models/Customer.ts — fullName virtual moves to the repository.
// Search (app/api/customers/route.ts) is a case-insensitive substring match
// on first_name/last_name/email/phone → trigram indexes (needs pg_trgm).
export const customers = pgTable(
  'customers',
  {
    id: id(),
    tenantId: tenantId(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    // Lowercased + trimmed by the repository layer
    email: text('email'),
    phone: text('phone'),
    // Variable-length, no _id, always read/written as a whole
    addresses: jsonb('addresses').$type<CustomerAddress[]>().notNull().default([]),
    dateOfBirth: timestamptz('date_of_birth'),
    notes: text('notes'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    totalSpent: money('total_spent').notNull().default(0),
    lastPurchaseDate: timestamptz('last_purchase_date'),
    loyaltyPointsBalance: integer('loyalty_points_balance').notNull().default(0),
    // Amount the customer owes the tenant (on-account / pay later)
    accountBalance: money('account_balance').notNull().default(0),
    // Max allowed account_balance after a sale; NULL = no limit
    creditLimit: money('credit_limit'),
    shopifyCustomerId: text('shopify_customer_id'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('customers_tenant_email_key').on(t.tenantId, t.email).where(sql`${t.email} IS NOT NULL`),
    index('customers_tenant_phone_idx').on(t.tenantId, t.phone).where(sql`${t.phone} IS NOT NULL`),
    index('customers_tenant_shopify_customer_id_idx')
      .on(t.tenantId, t.shopifyCustomerId)
      .where(sql`${t.shopifyCustomerId} IS NOT NULL`),
    index('customers_tenant_created_at_idx').on(t.tenantId, t.createdAt.desc()),
    index('customers_first_name_trgm_idx').using('gin', sql`${t.firstName} gin_trgm_ops`),
    index('customers_last_name_trgm_idx').using('gin', sql`${t.lastName} gin_trgm_ops`),
    index('customers_email_trgm_idx').using('gin', sql`${t.email} gin_trgm_ops`),
    index('customers_phone_trgm_idx').using('gin', sql`${t.phone} gin_trgm_ops`),
    check('customers_email_format', sql`${t.email} IS NULL OR ${t.email} ~ '^\\S+@\\S+\\.\\S+$'`),
    check(
      'customers_amounts_non_negative',
      sql`${t.totalSpent} >= 0 AND ${t.loyaltyPointsBalance} >= 0 AND ${t.accountBalance} >= 0 AND (${t.creditLimit} IS NULL OR ${t.creditLimit} >= 0)`
    ),
  ]
);

// models/Address.ts — client-portal (logged-in user) addresses, not customers.addresses.
// Single-default-per-user is maintained by the repository (unset others on insert/update).
export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    tenantId: tenantId(),
    userId: objectId('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    label: text('label').notNull().default('Home'),
    street: text('street').notNull(),
    city: text('city').notNull(),
    state: text('state'),
    zipCode: text('zip_code'),
    country: text('country').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  // Mongo index was { userId, tenantId }; both are always equality-matched, so
  // tenant-first ordering is equivalent and matches every other table.
  t => [index('addresses_tenant_user_idx').on(t.tenantId, t.userId)]
);

// models/CustomerOTP.ts
export const customerOtps = pgTable(
  'customer_otps',
  {
    id: id(),
    tenantId: tenantId(),
    phone: text('phone').notNull(),
    otp: text('otp').notNull(),
    expiresAt: timestamptz('expires_at').notNull(),
    verified: boolean('verified').notNull().default(false),
    // Mongo `max: 5` is not enforced: verify-otp $inc's before checking >= 5, so
    // the stored value can exceed 5. No CHECK on purpose.
    attempts: integer('attempts').notNull().default(0),
    ...timestamps(),
  },
  t => [
    index('customer_otps_tenant_phone_verified_idx').on(t.tenantId, t.phone, t.verified),
    // TTL in Mongo — enforced by lib/automations/ttl-cleanup.ts
    index('customer_otps_expires_at_idx').on(t.expiresAt),
    check('customer_otps_otp_length', sql`char_length(${t.otp}) = 6`),
  ]
);

export const CUSTOMER_BALANCE_PAYMENT_METHODS = ['cash', 'card', 'digital', 'check', 'other'] as const;

// models/CustomerBalancePayment.ts
export const customerBalancePayments = pgTable(
  'customer_balance_payments',
  {
    id: id(),
    tenantId: tenantId(),
    customerId: objectId('customer_id')
      .notNull()
      .references((): AnyPgColumn => customers.id),
    amount: money('amount').notNull(),
    method: text('method', { enum: CUSTOMER_BALANCE_PAYMENT_METHODS }).notNull(),
    notes: text('notes'),
    recordedBy: objectId('recorded_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    ...timestamps(),
  },
  t => [
    index('customer_balance_payments_tenant_customer_created_at_idx').on(t.tenantId, t.customerId, t.createdAt.desc()),
    uniqueIndex('customer_balance_payments_tenant_idempotency_key_key')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
    check(
      'customer_balance_payments_method_check',
      sql`${t.method} IN ('cash', 'card', 'digital', 'check', 'other')`
    ),
    check('customer_balance_payments_amount_positive', sql`${t.amount} >= 0.01`),
  ]
);

// models/LoyaltyConfig.ts — 1:1 with tenant
export const loyaltyConfigs = pgTable(
  'loyalty_configs',
  {
    id: id(),
    tenantId: tenantId(),
    pointsPerPeso: rate('points_per_peso').notNull().default(1),
    pesoPerPoint: rate('peso_per_point').notNull().default(0.1),
    minRedemption: integer('min_redemption').notNull().default(100),
    isEnabled: boolean('is_enabled').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('loyalty_configs_tenant_id_key').on(t.tenantId),
    check(
      'loyalty_configs_values_check',
      sql`${t.pointsPerPeso} >= 0.01 AND ${t.pesoPerPoint} >= 0.01 AND ${t.minRedemption} >= 1`
    ),
  ]
);

export const LOYALTY_TRANSACTION_TYPES = ['earn', 'redeem', 'adjust'] as const;

// models/LoyaltyTransaction.ts
export const loyaltyTransactions = pgTable(
  'loyalty_transactions',
  {
    id: id(),
    tenantId: tenantId(),
    customerId: objectId('customer_id')
      .notNull()
      .references((): AnyPgColumn => customers.id),
    transactionId: objectId('transaction_id').references((): AnyPgColumn => transactions.id, { onDelete: 'set null' }),
    type: text('type', { enum: LOYALTY_TRANSACTION_TYPES }).notNull(),
    // Signed delta (negative for redeem / downward adjust)
    points: integer('points').notNull(),
    balanceBefore: integer('balance_before').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    description: text('description').notNull(),
    createdBy: objectId('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  t => [
    index('loyalty_transactions_tenant_customer_created_at_idx').on(t.tenantId, t.customerId, t.createdAt.desc()),
    index('loyalty_transactions_tenant_transaction_idx').on(t.tenantId, t.transactionId),
    check('loyalty_transactions_type_check', sql`${t.type} IN ('earn', 'redeem', 'adjust')`),
    check('loyalty_transactions_balances_non_negative', sql`${t.balanceBefore} >= 0 AND ${t.balanceAfter} >= 0`),
  ]
);

export const CAMPAIGN_CHANNELS = ['email', 'sms'] as const;
export const CAMPAIGN_SEGMENTS = ['all', 'new', 'regular', 'vip', 'at_risk', 'lapsed'] as const;
export const CAMPAIGN_STATUSES = ['draft', 'sent', 'failed'] as const;

// models/Campaign.ts
export const campaigns = pgTable(
  'campaigns',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    channel: text('channel', { enum: CAMPAIGN_CHANNELS }).notNull(),
    segment: text('segment', { enum: CAMPAIGN_SEGMENTS }).notNull(),
    // Email only
    subject: text('subject'),
    body: text('body').notNull(),
    status: text('status', { enum: CAMPAIGN_STATUSES }).notNull().default('draft'),
    sentCount: integer('sent_count').notNull().default(0),
    sentAt: timestamptz('sent_at'),
    createdBy: objectId('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  t => [
    index('campaigns_tenant_status_created_at_idx').on(t.tenantId, t.status, t.createdAt.desc()),
    check('campaigns_channel_check', sql`${t.channel} IN ('email', 'sms')`),
    check('campaigns_segment_check', sql`${t.segment} IN ('all', 'new', 'regular', 'vip', 'at_risk', 'lapsed')`),
    check('campaigns_status_check', sql`${t.status} IN ('draft', 'sent', 'failed')`),
  ]
);

export const DISCOUNT_TYPES = ['percentage', 'fixed'] as const;
export const DISCOUNT_CATEGORIES = ['general', 'senior', 'pwd', 'employee', 'promo'] as const;

// models/Discount.ts — delete guard (refuse DELETE when usage_count > 0; deactivate instead)
// moves to the repository.
export const discounts = pgTable(
  'discounts',
  {
    id: id(),
    tenantId: tenantId(),
    // Uppercased + trimmed by the repository layer
    code: text('code').notNull(),
    name: text('name'),
    description: text('description'),
    type: text('type', { enum: DISCOUNT_TYPES }).notNull(),
    // Percentage (0-100) or a fixed peso amount depending on `type`. rate()
    // (scale 6) holds both exactly; fixed amounts never need > 6 integer digits.
    value: rate('value').notNull(),
    // BIR: Senior/PWD discount tracking
    category: text('category', { enum: DISCOUNT_CATEGORIES }).notNull().default('general'),
    requiresIdVerification: boolean('requires_id_verification').notNull().default(false),
    minPurchaseAmount: money('min_purchase_amount'),
    // For percentage discounts
    maxDiscountAmount: money('max_discount_amount'),
    validFrom: timestamptz('valid_from').notNull(),
    validUntil: timestamptz('valid_until').notNull(),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('discounts_tenant_code_key').on(t.tenantId, t.code),
    index('discounts_tenant_active_valid_idx').on(t.tenantId, t.isActive, t.validFrom, t.validUntil),
    check('discounts_type_check', sql`${t.type} IN ('percentage', 'fixed')`),
    check('discounts_category_check', sql`${t.category} IN ('general', 'senior', 'pwd', 'employee', 'promo')`),
    check('discounts_value_check', sql`${t.value} >= 0 AND (${t.type} <> 'percentage' OR ${t.value} <= 100)`),
    check('discounts_valid_range_check', sql`${t.validUntil} > ${t.validFrom}`),
    check(
      'discounts_amounts_check',
      sql`(${t.minPurchaseAmount} IS NULL OR ${t.minPurchaseAmount} >= 0) AND (${t.maxDiscountAmount} IS NULL OR ${t.maxDiscountAmount} >= 0) AND (${t.usageLimit} IS NULL OR ${t.usageLimit} >= 1) AND ${t.usageCount} >= 0`
    ),
  ]
);
