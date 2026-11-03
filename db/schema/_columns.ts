/**
 * Shared column builders for the Postgres schema (Phase 2 of the migration —
 * see docs/postgres-migration.md). Every table uses these so ids, tenant
 * scoping, timestamps and money behave identically everywhere.
 */
import { char, numeric, timestamp } from 'drizzle-orm/pg-core';
import { ObjectId } from 'bson';
import { tenants } from './core';

/**
 * Ids stay 24-char ObjectId hex strings: they are already in URLs, JWTs and
 * the IndexedDB offline store. The ETL copies existing `_id`s verbatim; new
 * rows get a fresh ObjectId so ids keep their embedded creation time.
 */
export const newId = () => new ObjectId().toHexString();

export const id = () => char('id', { length: 24 }).primaryKey().$defaultFn(newId);

/** A 24-char ObjectId column without constraints. Add `.references()` at the call site. */
export const objectId = (name: string) => char(name, { length: 24 });

/**
 * Required tenant scope. No ON DELETE CASCADE on purpose: deleting a tenant
 * must stay an explicit, audited operation (super-admin reset/delete routes),
 * never a side effect of one DELETE.
 */
export const tenantId = () =>
  objectId('tenant_id')
    .notNull()
    .references(() => tenants.id);

/** timestamptz, returned as a JS Date */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Mongoose `timestamps: true` */
export const timestamps = () => ({
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Currency amounts. Mongo stored floats; the ETL rounds to 2 decimals. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });

/** Stock levels and line quantities. 3 decimals so weighed/partial units survive the ETL. */
export const quantity = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

/** Percentages, tax rates, exchange rates, multipliers. */
export const rate = (name: string) => numeric(name, { precision: 12, scale: 6, mode: 'number' });
