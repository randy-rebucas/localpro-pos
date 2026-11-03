/**
 * Root tables: tenants and users. Every tenant-scoped table references
 * tenants.id; created_by / user_id style columns reference users.id.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { ITenantSettings } from '@/types/tenant';
import { id, money, objectId, timestamps, timestamptz } from './_columns';
import { branches } from './org';

export const TENANT_ONBOARDING_STATUSES = ['not_started', 'in_progress', 'complete'] as const;

// models/Tenant.ts
export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    // Lowercased + trimmed by the repository layer (Mongoose setters today)
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    domain: text('domain'),
    subdomain: text('subdomain'),
    // ~150 nested fields, varies by business type and is always read as one
    // blob (cached in lib/cache.ts) → a single JSONB column. Mongoose schema
    // defaults are applied by the repository on create, not by Postgres.
    settings: jsonb('settings').$type<ITenantSettings>().notNull().default({} as ITenantSettings),
    isActive: boolean('is_active').notNull().default(true),
    onboardingStatus: text('onboarding_status', { enum: TENANT_ONBOARDING_STATUSES }).notNull().default('not_started'),
    notes: text('notes'),
    createdBy: objectId('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    // BIR Grand Total Accumulator — never decremented
    grandTotalSales: money('grand_total_sales').notNull().default(0),
    grandTotalTransactionCount: integer('grand_total_transaction_count').notNull().default(0),
    ...timestamps(),
  },
  t => [
    uniqueIndex('tenants_slug_key').on(t.slug),
    uniqueIndex('tenants_domain_key').on(t.domain).where(sql`${t.domain} IS NOT NULL`),
    uniqueIndex('tenants_subdomain_key').on(t.subdomain).where(sql`${t.subdomain} IS NOT NULL`),
    index('tenants_is_active_idx').on(t.isActive),
    check('tenants_slug_format', sql`${t.slug} ~ '^[a-z0-9-]+$'`),
    check('tenants_onboarding_status_check', sql`${t.onboardingStatus} IN ('not_started', 'in_progress', 'complete')`),
    check('tenants_grand_totals_non_negative', sql`${t.grandTotalSales} >= 0 AND ${t.grandTotalTransactionCount} >= 0`),
  ]
);

export const USER_ROLES = ['owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin'] as const;

// models/User.ts
export const users = pgTable(
  'users',
  {
    id: id(),
    // Lowercased + trimmed by the repository layer. Unique across ALL tenants
    // (existing behaviour — do not change during the migration).
    email: text('email').notNull(),
    // bcrypt hash; hashing moves from the pre-save hook into the repository.
    // Repositories must never return it unless explicitly asked (select: false today).
    password: text('password').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('cashier'),
    qrToken: text('qr_token'),
    // Null only for super_admin
    tenantId: objectId('tenant_id').references(() => tenants.id),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    lastLogin: timestamptz('last_login'),
    ...timestamps(),
  },
  t => [
    // Global unique email also covers the Mongo {tenantId, email} unique index
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_qr_token_key').on(t.qrToken).where(sql`${t.qrToken} IS NOT NULL`),
    index('users_tenant_role_active_idx').on(t.tenantId, t.role, t.isActive),
    index('users_tenant_branch_active_idx').on(t.tenantId, t.branchId, t.isActive),
    check('users_role_check', sql`${t.role} IN ('owner', 'admin', 'manager', 'cashier', 'viewer', 'super_admin')`),
    check('users_tenant_required', sql`${t.role} = 'super_admin' OR ${t.tenantId} IS NOT NULL`),
  ]
);

