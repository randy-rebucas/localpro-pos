/**
 * Domain 5 (customers and CRM): customers, on-account balance payments,
 * loyalty point transactions and marketing campaigns.
 *
 * Every method takes `tenantId` first and scopes by it. Loyalty config and
 * discounts belong to domain 1 (lookup.ts); client-portal addresses and OTPs
 * to domain 2 (identity.ts).
 */
import type { DbTx } from './tx';
import type { Id, Patch, UpdateResult } from './types';
import type { Select } from './identity';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

// ─── Customers ──────────────────────────────────────────────────────────────

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isDefault: boolean;
}

export interface Customer extends Timestamps {
  _id: Id;
  tenantId: Id;
  firstName: string;
  lastName: string;
  /** Stored lowercased and trimmed. */
  email?: string;
  phone?: string;
  addresses: CustomerAddress[];
  dateOfBirth?: Date;
  notes?: string;
  tags: string[];
  totalSpent: number;
  lastPurchaseDate?: Date;
  loyaltyPointsBalance: number;
  /** Amount owed on account (charged sales minus balance payments). */
  accountBalance: number;
  creditLimit?: number;
  shopifyCustomerId?: string;
  isActive: boolean;
}

export type CustomerFields = Omit<Customer, '_id' | 'tenantId' | 'addresses' | keyof Timestamps> & {
  addresses: Array<Partial<CustomerAddress>>;
};

/** Missing fields get the schema defaults. */
export type CustomerInput = Pick<CustomerFields, 'firstName' | 'lastName'> & Partial<CustomerFields>;

export interface CustomerFilter {
  ids?: Id[];
  excludeId?: Id;
  /** Exact isActive. */
  isActive?: boolean;
  /** isActive !== false (a missing value counts as active). */
  notDisabled?: true;
  /** Case-insensitive substring of first name, last name, email or phone (literal, no regex). */
  search?: string;
  /** Exact email (lowercased by the repository). */
  email?: string;
  phone?: string;
  /** The field is set and not empty. */
  hasContact?: 'email' | 'phone';
  minLoyaltyPoints?: number;
}

export interface CustomerRepo {
  /** Newest first. */
  list(
    tenantId: Id,
    filter?: CustomerFilter,
    opts?: { select?: Select; page?: { skip: number; limit: number } }
  ): Promise<Customer[]>;
  count(tenantId: Id, filter?: CustomerFilter): Promise<number>;
  /** The first match (no particular order). */
  findOne(tenantId: Id, filter: CustomerFilter, opts?: { select?: Select; tx?: DbTx }): Promise<Customer | null>;
  findById(tenantId: Id, id: Id, opts?: { select?: Select; tx?: DbTx }): Promise<Customer | null>;
  /** Setters (trim, lowercase email) and validators run. Throws DuplicateKeyError for a taken email. */
  create(tenantId: Id, input: CustomerInput): Promise<Customer>;
  /** Loads and saves, so setters and validators run. `null` clears a field. */
  update(tenantId: Id, id: Id, patch: Patch<CustomerFields>, opts?: { tx?: DbTx }): Promise<UpdateResult<Customer> | null>;
  /** Atomically adds `delta` (may be negative) to accountBalance. */
  adjustAccountBalance(tenantId: Id, id: Id, delta: number, opts?: { tx?: DbTx }): Promise<void>;
  /** Single-field write without validators, for checkout and refunds. */
  setBalances(
    tenantId: Id,
    id: Id,
    set: Partial<Pick<Customer, 'accountBalance' | 'loyaltyPointsBalance'>>,
    opts?: { tx?: DbTx }
  ): Promise<void>;
  /** Customers with a positive points balance, and the sum of their points. */
  loyaltyStats(tenantId: Id): Promise<{ enrolledCount: number; totalPoints: number }>;
}

// ─── Balance payments ───────────────────────────────────────────────────────

export const BALANCE_PAYMENT_METHODS = ['cash', 'card', 'digital', 'check', 'other'] as const;

export interface BalancePayment extends Timestamps {
  _id: Id;
  tenantId: Id;
  customerId: Id;
  amount: number;
  method: (typeof BALANCE_PAYMENT_METHODS)[number];
  notes?: string;
  recordedBy?: Id;
  /** Unique per tenant when set. */
  idempotencyKey?: string;
}

export type BalancePaymentInput = Pick<BalancePayment, 'customerId' | 'amount' | 'method'> &
  Partial<Pick<BalancePayment, 'notes' | 'recordedBy' | 'idempotencyKey'>>;

export interface BalancePaymentRepo {
  /** The customer's payments, newest first. */
  list(tenantId: Id, customerId: Id, opts: { limit: number }): Promise<BalancePayment[]>;
  findByIdempotencyKey(tenantId: Id, key: string): Promise<BalancePayment | null>;
  /** Throws DuplicateKeyError for a reused idempotencyKey. */
  create(tenantId: Id, input: BalancePaymentInput, opts?: { tx?: DbTx }): Promise<BalancePayment>;
}

// ─── Loyalty transactions ───────────────────────────────────────────────────

export interface LoyaltyTransaction extends Timestamps {
  _id: Id;
  tenantId: Id;
  customerId: Id;
  /** The sale that earned or redeemed the points; null for adjustments. */
  transactionId: Id | null;
  type: 'earn' | 'redeem' | 'adjust';
  points: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdBy: Id | null;
}

export type LoyaltyTransactionInput = Pick<
  LoyaltyTransaction,
  'customerId' | 'type' | 'points' | 'balanceBefore' | 'balanceAfter' | 'description'
> &
  Partial<Pick<LoyaltyTransaction, 'transactionId' | 'createdBy'>>;

export interface LoyaltyTransactionRepo {
  /** The customer's history, newest first. */
  list(
    tenantId: Id,
    customerId: Id,
    opts: { page: { skip: number; limit: number }; select?: Select }
  ): Promise<LoyaltyTransaction[]>;
  count(tenantId: Id, customerId: Id): Promise<number>;
  create(tenantId: Id, input: LoyaltyTransactionInput, opts?: { tx?: DbTx }): Promise<LoyaltyTransaction>;
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export const CAMPAIGN_SEGMENTS = ['all', 'new', 'regular', 'vip', 'at_risk', 'lapsed'] as const;
export type CampaignSegment = (typeof CAMPAIGN_SEGMENTS)[number];

export interface Campaign extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  channel: 'email' | 'sms';
  segment: CampaignSegment;
  subject?: string;
  body: string;
  status: 'draft' | 'sent' | 'failed';
  sentCount: number;
  sentAt?: Date;
  createdBy?: Id;
}

export type CampaignInput = Pick<Campaign, 'name' | 'channel' | 'segment' | 'body'> &
  Partial<Pick<Campaign, 'subject' | 'createdBy'>>;

export interface CampaignRepo {
  /** Newest first. */
  list(tenantId: Id, opts: { limit: number }): Promise<Campaign[]>;
  exists(tenantId: Id, id: Id): Promise<boolean>;
  create(tenantId: Id, input: CampaignInput): Promise<Campaign>;
  /**
   * Atomically moves a draft or failed campaign to `sent`, so two concurrent
   * sends can't both deliver it. Null when it isn't sendable (or missing).
   */
  claimForSending(tenantId: Id, id: Id): Promise<Campaign | null>;
  /** Records the outcome of a send. */
  recordSendResult(tenantId: Id, id: Id, result: Pick<Campaign, 'status' | 'sentCount' | 'sentAt'>): Promise<Campaign | null>;
}

export interface CrmRepos {
  customers: CustomerRepo;
  balancePayments: BalancePaymentRepo;
  loyaltyTransactions: LoyaltyTransactionRepo;
  campaigns: CampaignRepo;
}
