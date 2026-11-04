/**
 * Domain 3 (billing): subscription plans, per-tenant subscriptions (with their
 * billing history and usage counters) and billing events.
 *
 * Plans are a global catalog, not tenant-scoped. A tenant has at most one
 * subscription. Subscription and billing-event methods take `tenantId` first;
 * the super-admin lists, plan statistics and billing automations that read
 * every tenant say so in their name (`...AcrossTenants`).
 */
import type { DbTx } from './tx';
import type { Id, Patch, Ref } from './types';
import type { Select, Tenant } from './identity';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

// ─── Subscription plans ─────────────────────────────────────────────────────

export const SUBSCRIPTION_TIERS = ['starter', 'pro', 'business', 'enterprise'] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export interface PlanPrice {
  monthly: number;
  setupFee: number;
  currency: string;
}

/** Limits are -1 for unlimited. */
export interface PlanFeatures {
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  maxTransactions: number;
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
}

export interface PlanBirCompliance {
  ptuAssistance: boolean;
  receiptFormatting: boolean;
  birDocumentation: boolean;
  casReporting: boolean;
  auditTrailSystem: boolean;
  monthlySupport: boolean;
}

export interface PlanPharmacyCompliance {
  enablePharmacyCompliance: boolean;
  prescriptionManagement: boolean;
  expiryTracking: boolean;
  pdeaReporting: boolean;
}

export interface SubscriptionPlan extends Timestamps {
  _id: Id;
  name: string;
  tier: SubscriptionTier;
  description?: string;
  price: PlanPrice;
  /** Flat fee to reactivate an account deactivated for non-payment. */
  reactivationFee: number;
  features: PlanFeatures;
  birCompliance: PlanBirCompliance;
  pharmacyCompliance: PlanPharmacyCompliance;
  isActive: boolean;
  isCustom: boolean;
  availableToNewTenants: boolean;
  /** Percent, 0–100. */
  yearlyDiscount: number;
}

/**
 * Nested objects may be partial: missing price/flag fields get the schema
 * defaults (setupFee 0, currency PHP, flags false except inventory, categories
 * and reports). The max* limits are required.
 */
export type SubscriptionPlanInput = Pick<SubscriptionPlan, 'name' | 'tier'> &
  Partial<
    Pick<
      SubscriptionPlan,
      'description' | 'reactivationFee' | 'isActive' | 'isCustom' | 'availableToNewTenants' | 'yearlyDiscount'
    >
  > & {
    price: Partial<PlanPrice> & Pick<PlanPrice, 'monthly'>;
    features: Partial<PlanFeatures> & Pick<PlanFeatures, 'maxUsers' | 'maxBranches' | 'maxProducts' | 'maxTransactions'>;
    birCompliance?: Partial<PlanBirCompliance>;
    pharmacyCompliance?: Partial<PlanPharmacyCompliance>;
  };

/** A nested object in a patch replaces the stored object as a whole (Mongo `$set: { features }`). */
export type SubscriptionPlanPatch = Patch<SubscriptionPlanInput>;

export interface SubscriptionPlanRepo {
  /** Sorted by monthly price, cheapest first. */
  list(filter?: { activeOnly?: boolean }): Promise<SubscriptionPlan[]>;
  findById(id: Id, opts?: { activeOnly?: boolean }): Promise<SubscriptionPlan | null>;
  findByTier(tier: string, opts?: { activeOnly?: boolean }): Promise<SubscriptionPlan | null>;
  /** Throws DuplicateKeyError for a taken tier. */
  create(input: SubscriptionPlanInput): Promise<SubscriptionPlan>;
  /** Validators run on the written fields. Returns null when the plan doesn't exist. */
  update(id: Id, patch: SubscriptionPlanPatch): Promise<SubscriptionPlan | null>;
  /** Creates the tier's plan or overwrites the given fields of the existing one (system seed). */
  upsertByTier(input: SubscriptionPlanInput): Promise<SubscriptionPlan>;
  /**
   * Hard delete. Throws when active or trial subscriptions still reference
   * the plan (callers check countActiveOnPlanAcrossTenants first and
   * deactivate instead).
   */
  delete(id: Id): Promise<boolean>;
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'cancelled', 'suspended', 'trial', 'paused'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = 'monthly' | 'yearly';

export interface PaymentMethod {
  type: 'card' | 'bank' | 'paypal' | 'manual';
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  provider?: string;
}

export interface BillingHistoryEntry {
  _id: Id;
  date: Date;
  amount: number;
  currency: string;
  status: 'paid' | 'failed' | 'pending' | 'refunded';
  transactionId?: string;
  invoiceUrl?: string;
}

export type BillingHistoryInput = Omit<BillingHistoryEntry, '_id' | 'currency'> & { currency?: string };

export interface SubscriptionUsage {
  currentUsers: number;
  currentBranches: number;
  currentProducts: number;
  currentTransactions: number;
  lastResetDate: Date;
}

export interface Subscription extends Timestamps {
  _id: Id;
  tenantId: Id;
  planId: Id;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  startDate: Date;
  endDate?: Date;
  trialEndDate?: Date;
  nextBillingDate?: Date;
  lastBillingDate?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  suspendedAt?: Date;
  pausedAt?: Date;
  pauseReason?: string;
  pauseEndsAt?: Date;
  gracePeriodEndDate?: Date;
  trialConvertedAt?: Date;
  paymentOverdue: boolean;
  outstandingBalance: number;
  lastInvoiceGeneratedAt?: Date;
  lateFeeAppliedAt?: Date;
  reactivationFeeAppliedAt?: Date;
  deactivatedAt?: Date;
  paymentMethod?: PaymentMethod;
  /** Oldest first. Empty when the read used `omitBillingHistory`. */
  billingHistory: BillingHistoryEntry[];
  usage: SubscriptionUsage;
  isTrial: boolean;
  autoRenew: boolean;
  isActive: boolean;
}

/**
 * Which references to populate, each with a field list (Mongoose `.select()`
 * syntax): `{ plan: 'name tier price' }` returns `planId` as
 * `{ _id, name, tier, price }`, or null when the plan no longer exists.
 */
export interface SubscriptionPopulate {
  plan?: Select;
  tenant?: Select;
}

/** A subscription read with `populate`. Callers read only the populated fields they asked for. */
export type PopulatedSubscription = Omit<Subscription, 'planId' | 'tenantId'> & {
  planId: Ref<Partial<SubscriptionPlan>>;
  tenantId: Ref<Partial<Tenant>>;
};

/** Every field set at creation time; missing ones get the schema defaults (status trial, usage 0/1/0/0). */
export type SubscriptionInput = Pick<Subscription, 'planId'> &
  Partial<Omit<Subscription, '_id' | 'tenantId' | 'planId' | 'usage' | 'billingHistory' | keyof Timestamps>> & {
    usage?: Partial<SubscriptionUsage>;
    billingHistory?: BillingHistoryInput[];
  };

/** The top-level fields an update may write (usage has its own methods). */
export type SubscriptionFields = Omit<
  Subscription,
  '_id' | 'tenantId' | 'usage' | 'billingHistory' | keyof Timestamps
>;

export interface SubscriptionUpdate {
  /** `undefined` leaves a field, `null` clears it. */
  set?: Patch<SubscriptionFields>;
  /** Appends one entry to billingHistory. */
  addBillingEntry?: BillingHistoryInput;
}

type DateRange = { gte?: Date; lte?: Date };

/**
 * A structured filter for the super-admin lists and billing automations.
 * Every given condition must hold. `tenantId` narrows to one tenant;
 * without it the filter matches across tenants.
 */
export interface SubscriptionFilter {
  tenantId?: Id;
  ids?: Id[];
  status?: SubscriptionStatus | SubscriptionStatus[];
  isTrial?: boolean;
  autoRenew?: boolean;
  paymentOverdue?: boolean;
  /** true: isActive !== false (a missing value counts as active). */
  notDisabled?: boolean;
  nextBillingDate?: DateRange;
  trialEndDate?: DateRange;
  /** A range here also requires endDate to be set. */
  endDate?: DateRange;
  gracePeriodEndDate?: DateRange;
  /** These date fields must be unset. */
  unset?: ('deactivatedAt' | 'lateFeeAppliedAt' | 'reactivationFeeAppliedAt')[];
}

export interface SubscriptionRepo {
  /** The tenant's subscription. `status` restricts it to those statuses. */
  findByTenant(
    tenantId: Id,
    opts?: { status?: SubscriptionStatus[]; populate?: SubscriptionPopulate; tx?: DbTx }
  ): Promise<PopulatedSubscription | null>;
  /** The subscription only if it belongs to `tenantId`. */
  findById(tenantId: Id, id: Id, opts?: { populate?: SubscriptionPopulate }): Promise<PopulatedSubscription | null>;
  /** Super-admin lookup by id, any tenant. */
  findByIdAcrossTenants(id: Id, opts?: { populate?: SubscriptionPopulate }): Promise<PopulatedSubscription | null>;
  /** Only the usage counters (cheap read for the per-sale limit check). */
  findUsage(tenantId: Id): Promise<SubscriptionUsage | null>;
  /**
   * Newest first. With `page`, `total` counts every match; without it every
   * match is returned.
   */
  listAcrossTenants(
    filter: SubscriptionFilter,
    opts?: { page?: { skip: number; limit: number }; populate?: SubscriptionPopulate; omitBillingHistory?: boolean }
  ): Promise<{ items: PopulatedSubscription[]; total: number }>;
  /** Billing automations: full subscriptions matching the filter, in no particular order. */
  findAcrossTenants(filter: SubscriptionFilter, opts?: { tx?: DbTx }): Promise<Subscription[]>;
  /** Sets fields on every match and returns how many were modified. */
  updateManyAcrossTenants(filter: SubscriptionFilter, set: Patch<SubscriptionFields>, opts?: { tx?: DbTx }): Promise<number>;
  /** Active and trial subscriptions per planId (plans without any are absent). */
  countActiveByPlanAcrossTenants(): Promise<Record<Id, number>>;
  /** Active and trial subscriptions on one plan. */
  countActiveOnPlanAcrossTenants(planId: Id): Promise<number>;
  /** Throws DuplicateKeyError when the tenant already has a subscription. */
  create(tenantId: Id, input: SubscriptionInput, opts?: { tx?: DbTx }): Promise<Subscription>;
  /**
   * Applies the update and returns the updated subscription, or null when it
   * doesn't exist in the tenant, or (with `ifStatus`) its status is no longer
   * `ifStatus` (optimistic concurrency).
   */
  update(
    tenantId: Id,
    id: Id,
    ops: SubscriptionUpdate,
    opts?: { ifStatus?: SubscriptionStatus; populate?: SubscriptionPopulate; tx?: DbTx }
  ): Promise<PopulatedSubscription | null>;
  /** Super-admin delete: deactivates and cancels an active-flagged subscription. Null when none matched. */
  softDeleteAcrossTenants(id: Id): Promise<Subscription | null>;
  /**
   * Adds one to the monthly transaction counter if it was reset on or after
   * `since`. False when it wasn't (or there's no subscription), so the caller
   * re-seeds it with setUsage.
   */
  incrementTransactionsSince(tenantId: Id, since: Date): Promise<boolean>;
  /**
   * Overwrites the given usage counters. Usage-only writes do not invalidate
   * the cached subscription status (one happens on every sale).
   */
  setUsage(tenantId: Id, usage: Partial<SubscriptionUsage>): Promise<void>;
}

// ─── Billing events ─────────────────────────────────────────────────────────

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
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export interface BillingEvent extends Timestamps {
  _id: Id;
  tenantId: Id;
  subscriptionId: Id;
  type: BillingEventType;
  /** Signed: refunds and credits may be negative. */
  amount: number;
  currency: string;
  description?: string;
  notes?: string;
  /** External payment-provider id; unique per tenant when set. */
  transactionId?: string;
  invoiceUrl?: string;
  recordedBy?: Id;
  metadata?: Record<string, unknown>;
}

/** `currency` defaults to PHP. */
export type BillingEventInput = Pick<BillingEvent, 'subscriptionId' | 'type' | 'amount'> &
  Partial<Pick<BillingEvent, 'currency' | 'description' | 'notes' | 'transactionId' | 'invoiceUrl' | 'recordedBy' | 'metadata'>>;

export interface BillingEventRepo {
  /** Throws DuplicateKeyError when the tenant already has an event with this transactionId. */
  create(tenantId: Id, input: BillingEventInput, opts?: { tx?: DbTx }): Promise<BillingEvent>;
  /** Inserts events for several tenants at once (billing automations). */
  createManyAcrossTenants(events: (BillingEventInput & { tenantId: Id })[], opts?: { tx?: DbTx }): Promise<void>;
  /** The event recording this payment-provider id, optionally of one subscription and type. */
  findByTransactionId(
    tenantId: Id,
    transactionId: string,
    scope?: { subscriptionId?: Id; type?: BillingEventType }
  ): Promise<BillingEvent | null>;
  /** Newest first. */
  list(tenantId: Id, page: { skip: number; limit: number }): Promise<{ items: BillingEvent[]; total: number }>;
}

export interface BillingRepos {
  subscriptionPlans: SubscriptionPlanRepo;
  subscriptions: SubscriptionRepo;
  billingEvents: BillingEventRepo;
}
