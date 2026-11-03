/**
 * Org structure and back-office: branches, registered POS devices, dining
 * tables and expenses.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { id, money, objectId, tenantId, timestamps, timestamptz } from './_columns';
import { users } from './core';
import { transactions } from './sales';

// models/Branch.ts
export const branches = pgTable(
  'branches',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    // Uppercased + trimmed by the repository layer
    code: text('code'),
    addressStreet: text('address_street'),
    addressCity: text('address_city'),
    addressState: text('address_state'),
    addressZipCode: text('address_zip_code'),
    addressCountry: text('address_country'),
    phone: text('phone'),
    email: text('email'),
    managerId: objectId('manager_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('branches_tenant_code_key').on(t.tenantId, t.code).where(sql`${t.code} IS NOT NULL`),
    index('branches_tenant_active_idx').on(t.tenantId, t.isActive),
  ]
);

export const DEVICE_PTU_STATUSES = ['pending', 'approved'] as const;

// models/Device.ts
export const devices = pgTable(
  'devices',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    label: text('label').notNull(),
    serialNumber: text('serial_number').notNull(),
    terminalId: text('terminal_id').notNull(),
    ptuNumber: text('ptu_number'),
    ptuStatus: text('ptu_status', { enum: DEVICE_PTU_STATUSES }).notNull().default('pending'),
    isActive: boolean('is_active').notNull().default(true),
    registeredBy: objectId('registered_by')
      .notNull()
      .references((): AnyPgColumn => users.id),
    ...timestamps(),
  },
  t => [
    uniqueIndex('devices_tenant_terminal_id_key').on(t.tenantId, t.terminalId),
    uniqueIndex('devices_tenant_serial_number_key').on(t.tenantId, t.serialNumber),
    index('devices_tenant_active_idx').on(t.tenantId, t.isActive),
    check('devices_ptu_status_check', sql`${t.ptuStatus} IN ('pending', 'approved')`),
  ]
);

export const DINING_TABLE_STATUSES = ['open', 'occupied', 'check-requested'] as const;

// models/Table.ts
export const diningTables = pgTable(
  'dining_tables',
  {
    id: id(),
    tenantId: tenantId(),
    branchId: objectId('branch_id').references((): AnyPgColumn => branches.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    capacity: integer('capacity'),
    status: text('status', { enum: DINING_TABLE_STATUSES }).notNull().default('open'),
    // Transaction in progress
    currentOrderId: objectId('current_order_id').references((): AnyPgColumn => transactions.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('dining_tables_tenant_active_status_idx').on(t.tenantId, t.isActive, t.status),
    // Unique per tenant, not per branch (existing behaviour — keep)
    uniqueIndex('dining_tables_tenant_name_key').on(t.tenantId, t.name),
    check('dining_tables_status_check', sql`${t.status} IN ('open', 'occupied', 'check-requested')`),
    check('dining_tables_capacity_check', sql`${t.capacity} IS NULL OR ${t.capacity} >= 1`),
  ]
);

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'digital', 'other'] as const;

// models/Expense.ts
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    amount: money('amount').notNull(),
    date: timestamptz('date').notNull().defaultNow(),
    paymentMethod: text('payment_method', { enum: EXPENSE_PAYMENT_METHODS }).notNull(),
    // URL or reference to receipt
    receipt: text('receipt'),
    notes: text('notes'),
    userId: objectId('user_id')
      .notNull()
      .references((): AnyPgColumn => users.id),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('expenses_tenant_date_idx').on(t.tenantId, t.date.desc()),
    index('expenses_tenant_name_idx').on(t.tenantId, t.name),
    check('expenses_payment_method_check', sql`${t.paymentMethod} IN ('cash', 'card', 'digital', 'other')`),
    check('expenses_amount_non_negative', sql`${t.amount} >= 0`),
  ]
);
