/**
 * Data-access entry point. Routes, automations and lib modules call
 * getRepos() instead of importing models, so the driver can be switched with
 * DB_DRIVER (docs/postgres-migration.md).
 *
 * Domains move here one at a time (Phase 3); models not yet covered are
 * still imported directly.
 */
import { config } from '@/lib/config';
import type { LookupRepos } from './lookup';
import type { IdentityRepos } from './identity';
import { mongoLookupRepos } from './mongo/lookup';
import { mongoIdentityRepos } from './mongo/identity';
import type { BillingRepos } from './billing';
import { mongoBillingRepos } from './mongo/billing';
import type { CatalogRepos } from './catalog';
import { mongoCatalogRepos } from './mongo/catalog';
import type { CrmRepos } from './crm';
import { mongoCrmRepos } from './mongo/crm';
import type { OperationsRepos } from './operations';
import { mongoOperationsRepos } from './mongo/operations';
import type { SalesRepos } from './sales';
import { mongoSalesRepos } from './mongo/sales';
import type { AuditRepos } from './audit';
import { mongoAuditRepos } from './mongo/audit';

export type Repos = LookupRepos &
  IdentityRepos &
  BillingRepos &
  CatalogRepos &
  CrmRepos &
  OperationsRepos &
  SalesRepos &
  AuditRepos;

const mongoRepos: Repos = {
  ...mongoLookupRepos,
  ...mongoIdentityRepos,
  ...mongoBillingRepos,
  ...mongoCatalogRepos,
  ...mongoCrmRepos,
  ...mongoOperationsRepos,
  ...mongoSalesRepos,
  ...mongoAuditRepos,
};

export function getRepos(): Repos {
  if (config.dbDriver === 'postgres') {
    // Implemented domain by domain in Phase 4
    throw new Error('DB_DRIVER=postgres is not implemented yet');
  }
  return mongoRepos;
}

export { runInTransaction, isTransactional, mongoTx, type DbTx } from './tx';
export { newId, isValidId } from './ids';
export { DuplicateKeyError, isDuplicateKeyError } from './errors';
export type * from './lookup';
export type * from './identity';
export { USER_ROLES } from './identity';
export type * from './billing';
export { SUBSCRIPTION_TIERS, SUBSCRIPTION_STATUSES, BILLING_EVENT_TYPES } from './billing';
export type * from './catalog';
export { PRODUCT_TYPES, CHANNEL_PROVIDERS, TAX_RULE_APPLIES_TO } from './catalog';
export type * from './crm';
export { BALANCE_PAYMENT_METHODS, CAMPAIGN_SEGMENTS } from './crm';
export type * from './operations';
export { BOOKING_STATUSES } from './operations';
export type * from './sales';
export type * from './audit';
export {
  TRANSACTION_STATUSES,
  TRANSACTION_PAYMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  INVOICE_STATUSES,
  STOCK_MOVEMENT_TYPES,
  PRESCRIPTION_STATUSES,
} from './sales';
export { TABLE_STATUSES, EXPENSE_PAYMENT_METHODS, LOYALTY_CONFIG_DEFAULTS } from './lookup';
export type * from './types';
