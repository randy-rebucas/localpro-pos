/**
 * Domain 1 (lookup data): categories, branches, devices, dining tables,
 * expenses, discounts, coupons, feature-flag overrides, loyalty config.
 *
 * Every tenant-scoped method takes `tenantId` first and scopes by it. Methods
 * that read across tenants say so in their name (`...AcrossTenants`).
 */
import type { DbTx } from './tx';
import type { Id, Patch, Ref, UpdateResult, UserSummary } from './types';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

// ─── Categories ─────────────────────────────────────────────────────────────

export interface Category extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  description?: string;
  isActive: boolean;
}

export type CategoryInput = Pick<Category, 'name'> & Partial<Pick<Category, 'description' | 'isActive'>>;

export interface CategoryRepo {
  /** All categories (active and inactive), sorted by name. */
  list(tenantId: Id): Promise<Category[]>;
  findById(tenantId: Id, id: Id, opts?: { activeOnly?: boolean }): Promise<Category | null>;
  /** Case-insensitive exact name match. */
  findByName(tenantId: Id, name: string): Promise<Category | null>;
  /** Throws DuplicateKeyError when the name is taken in this tenant. */
  create(tenantId: Id, input: CategoryInput): Promise<Category>;
  update(tenantId: Id, id: Id, patch: Patch<CategoryInput>): Promise<UpdateResult<Category> | null>;
}

// ─── Branches ───────────────────────────────────────────────────────────────

export interface BranchAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface Branch extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  code?: string;
  address?: BranchAddress;
  phone?: string;
  email?: string;
  managerId?: Id;
  isActive: boolean;
}

export type BranchWithManager = Omit<Branch, 'managerId'> & { managerId?: Ref<UserSummary> };

export type BranchInput = Pick<Branch, 'name'> &
  Partial<Pick<Branch, 'code' | 'address' | 'phone' | 'email' | 'managerId' | 'isActive'>>;

export interface BranchRepo {
  /** Sorted by name, manager populated with name and email. */
  list(tenantId: Id, filter?: { isActive?: boolean }): Promise<BranchWithManager[]>;
  findById(tenantId: Id, id: Id): Promise<Branch | null>;
  findByIdWithManager(tenantId: Id, id: Id): Promise<BranchWithManager | null>;
  /** Active branches sorted by name. */
  listActive(tenantId: Id): Promise<Branch[]>;
  /** Active branches of several tenants (public store directory), sorted by name. */
  listActiveAcrossTenants(tenantIds: Id[]): Promise<Pick<Branch, '_id' | 'tenantId' | 'name' | 'address'>[]>;
  countActive(tenantId: Id): Promise<number>;
  create(tenantId: Id, input: BranchInput): Promise<Branch>;
  update(tenantId: Id, id: Id, patch: Patch<BranchInput>): Promise<UpdateResult<Branch> | null>;
}

// ─── Devices ────────────────────────────────────────────────────────────────

export interface Device extends Timestamps {
  _id: Id;
  tenantId: Id;
  branchId?: Id;
  label: string;
  serialNumber: string;
  terminalId: string;
  ptuNumber?: string;
  ptuStatus: 'pending' | 'approved';
  isActive: boolean;
  registeredBy: Id;
}

export type DeviceWithRefs = Omit<Device, 'branchId' | 'registeredBy'> & {
  branchId?: Ref<{ name: string }>;
  registeredBy: Ref<UserSummary>;
};

export type DeviceInput = Pick<Device, 'label' | 'serialNumber' | 'terminalId' | 'registeredBy'> &
  Partial<Pick<Device, 'branchId' | 'ptuNumber' | 'ptuStatus' | 'isActive'>>;

export interface DeviceRepo {
  /** Sorted by terminalId, with branch name and registering user populated. */
  list(tenantId: Id, filter?: { isActive?: boolean }): Promise<DeviceWithRefs[]>;
  findById(tenantId: Id, id: Id): Promise<Device | null>;
  /** Throws DuplicateKeyError for a terminalId or serialNumber already used in this tenant. */
  create(tenantId: Id, input: DeviceInput): Promise<Device>;
  /** Throws DuplicateKeyError like create(). */
  update(tenantId: Id, id: Id, patch: Patch<Omit<DeviceInput, 'registeredBy'>>): Promise<UpdateResult<Device> | null>;
}

// ─── Dining tables ──────────────────────────────────────────────────────────

export const TABLE_STATUSES = ['open', 'occupied', 'check-requested'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export interface DiningTable extends Timestamps {
  _id: Id;
  tenantId: Id;
  branchId?: Id;
  name: string;
  capacity?: number;
  status: TableStatus;
  currentOrderId?: Id;
  isActive: boolean;
}

export type DiningTableInput = Pick<DiningTable, 'name'> &
  Partial<Pick<DiningTable, 'branchId' | 'capacity' | 'status' | 'currentOrderId' | 'isActive'>>;

export interface DiningTableRepo {
  /** Sorted by name. `isActive` omitted means all tables. */
  list(tenantId: Id, filter?: { isActive?: boolean; branchId?: Id; status?: TableStatus }): Promise<DiningTable[]>;
  findById(tenantId: Id, id: Id): Promise<DiningTable | null>;
  create(tenantId: Id, input: DiningTableInput): Promise<DiningTable>;
  update(tenantId: Id, id: Id, patch: Patch<DiningTableInput>): Promise<UpdateResult<DiningTable> | null>;
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export const EXPENSE_PAYMENT_METHODS = ['cash', 'card', 'digital', 'other'] as const;

export interface Expense extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  description: string;
  amount: number;
  date: Date;
  paymentMethod: (typeof EXPENSE_PAYMENT_METHODS)[number];
  receipt?: string;
  notes?: string;
  userId: Id;
  isActive: boolean;
}

export type ExpenseWithUser = Omit<Expense, 'userId'> & { userId: Ref<UserSummary> };

export type ExpenseInput = Pick<Expense, 'name' | 'description' | 'amount' | 'paymentMethod' | 'userId'> &
  Partial<Pick<Expense, 'date' | 'receipt' | 'notes'>>;

export interface ExpenseRepo {
  /** Excludes soft-deleted expenses. Newest first, user populated. `from`/`to` are inclusive. */
  list(tenantId: Id, filter?: { from?: Date; to?: Date; name?: string }): Promise<ExpenseWithUser[]>;
  findById(tenantId: Id, id: Id): Promise<Expense | null>;
  findByIdWithUser(tenantId: Id, id: Id): Promise<ExpenseWithUser | null>;
  create(tenantId: Id, input: ExpenseInput): Promise<Expense>;
  update(tenantId: Id, id: Id, patch: Patch<Omit<ExpenseInput, 'userId'>>): Promise<UpdateResult<Expense> | null>;
  /** Sets isActive=false on an active expense; null when not found or already deleted. */
  softDelete(tenantId: Id, id: Id): Promise<Expense | null>;
  /**
   * Cash expenses dated within [from, to]. Includes soft-deleted expenses,
   * matching the cash-drawer calculation as it was in Mongo.
   */
  listCashBetween(tenantId: Id, from: Date, to: Date): Promise<Pick<Expense, '_id' | 'amount' | 'date'>[]>;
}

// ─── Discounts ──────────────────────────────────────────────────────────────

export interface Discount extends Timestamps {
  _id: Id;
  tenantId: Id;
  code: string;
  name?: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  category: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  requiresIdVerification: boolean;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
}

export type DiscountInput = Pick<Discount, 'code' | 'type' | 'value' | 'validFrom' | 'validUntil'> &
  Partial<
    Pick<
      Discount,
      | 'name'
      | 'description'
      | 'category'
      | 'requiresIdVerification'
      | 'minPurchaseAmount'
      | 'maxDiscountAmount'
      | 'usageLimit'
      | 'usageCount'
      | 'isActive'
    >
  >;

export type DiscountSummary = Pick<Discount, '_id' | 'code' | 'name' | 'validUntil' | 'usageLimit' | 'usageCount'>;

export interface DiscountStatusCounts {
  active: number;
  expiringSoon: number;
  needsActivation: number;
  needsDeactivation: number;
}

export interface DiscountRepo {
  /** Newest first. `activeAt` keeps only active discounts valid at that instant. */
  list(tenantId: Id, filter?: { code?: string; activeAt?: Date }): Promise<Discount[]>;
  findById(tenantId: Id, id: Id): Promise<Discount | null>;
  /** The code is matched case-insensitively (codes are stored uppercase). */
  findByCode(tenantId: Id, code: string, opts?: { activeOnly?: boolean }): Promise<Discount | null>;
  /** A discount whose code starts with `prefix` and is still valid at `now`. */
  findValidByCodePrefix(tenantId: Id, prefix: string, now: Date): Promise<Discount | null>;
  /** Throws DuplicateKeyError when the code is taken in this tenant. */
  create(tenantId: Id, input: DiscountInput): Promise<Discount>;
  /** Inserts the discount only if no discount with its code exists. */
  createIfMissing(tenantId: Id, input: DiscountInput): Promise<void>;
  update(tenantId: Id, id: Id, patch: Patch<Omit<DiscountInput, 'code' | 'type'>>): Promise<UpdateResult<Discount> | null>;
  /** Hard delete. Throws when the discount has been used (usageCount > 0). */
  delete(tenantId: Id, id: Id): Promise<boolean>;
  /**
   * Atomically reserves one use of a discount that is active and valid at
   * `now`. The limit is part of the write, so concurrent checkouts can't both
   * take the last use. Returns the discount as it was before, or null.
   */
  claimUsage(tenantId: Id, code: string, now: Date): Promise<Discount | null>;
  /** Gives back a use taken by claimUsage() when the sale doesn't go through. */
  releaseUsage(tenantId: Id, id: Id): Promise<void>;

  // Automations (lib/automations/discount-management.ts)
  /**
   * Activates inactive discounts whose validFrom is in (validFromAfter, now],
   * are still valid and not used up. Returns the activated discounts when
   * `withDocs` is set.
   */
  activateDue(
    tenantId: Id,
    opts: { now: Date; validFromAfter: Date; withDocs: boolean }
  ): Promise<{ modified: number; discounts: DiscountSummary[] }>;
  /** Deactivates active discounts that expired or reached their usage limit. */
  deactivateDue(tenantId: Id, opts: { now: Date; withDocs: boolean }): Promise<{ modified: number; discounts: DiscountSummary[] }>;
  /** Active, usage-limited discounts updated after `since` (usage alerts). */
  listLimitedUsedSince(tenantId: Id, since: Date): Promise<Pick<Discount, '_id' | 'code' | 'name' | 'usageLimit' | 'usageCount'>[]>;
  /**
   * Counts for /api/automations/status. `tenantId: null` counts across all
   * tenants (cron system-health only).
   */
  statusCounts(tenantId: Id | null, now: Date): Promise<DiscountStatusCounts>;
}

// ─── Coupons (platform-wide, not tenant-scoped) ─────────────────────────────

export interface Coupon extends Timestamps {
  _id: Id;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  appliesTo: 'all_plans' | 'specific_plans';
  planIds: Id[];
  maxUses?: number;
  usedCount: number;
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
  createdBy: Id;
}

export type CouponInput = Pick<Coupon, 'code' | 'discountType' | 'discountValue' | 'createdBy'> &
  Partial<Pick<Coupon, 'description' | 'appliesTo' | 'planIds' | 'maxUses' | 'validFrom' | 'validUntil' | 'isActive'>>;

export interface CouponRepo {
  /** Newest first. */
  list(filter: { isActive?: boolean; page: number; limit: number }): Promise<{ items: Coupon[]; total: number }>;
  /** Case-insensitive (codes are stored uppercase). */
  findByCode(code: string): Promise<Coupon | null>;
  create(input: CouponInput): Promise<Coupon>;
  update(id: Id, patch: Patch<Omit<CouponInput, 'code' | 'createdBy'>>): Promise<Coupon | null>;
  /** Returns the deleted coupon, or null when it didn't exist. */
  delete(id: Id): Promise<Coupon | null>;
  /**
   * Atomically reserves one use; false when maxUses is already reached.
   * The limit is part of the write, so concurrent checkouts can't both
   * take the last use.
   */
  incrementUsage(id: Id, tx?: DbTx): Promise<boolean>;
}

// ─── Feature-flag overrides ─────────────────────────────────────────────────

export interface FeatureFlagOverride extends Timestamps {
  _id: Id;
  tenantId: Id;
  feature: string;
  enabled: boolean;
  reason?: string;
  expiresAt?: Date;
  grantedBy: Id;
}

export interface FeatureFlagOverrideRepo {
  /** Newest first. */
  list(tenantId: Id): Promise<FeatureFlagOverride[]>;
  /** Creates or updates the override for (tenant, feature). Undefined fields keep their stored value. */
  upsert(
    tenantId: Id,
    feature: string,
    fields: Pick<FeatureFlagOverride, 'enabled' | 'grantedBy'> & Patch<Pick<FeatureFlagOverride, 'reason' | 'expiresAt'>>
  ): Promise<FeatureFlagOverride>;
  delete(tenantId: Id, feature: string): Promise<void>;
}

// ─── Loyalty config (one row per tenant) ────────────────────────────────────

export interface LoyaltyConfig extends Timestamps {
  _id: Id;
  tenantId: Id;
  pointsPerPeso: number;
  pesoPerPoint: number;
  minRedemption: number;
  isEnabled: boolean;
}

export const LOYALTY_CONFIG_DEFAULTS = {
  pointsPerPeso: 1,
  pesoPerPoint: 0.1,
  minRedemption: 100,
  isEnabled: true,
} as const;

export interface LoyaltyConfigRepo {
  get(tenantId: Id): Promise<LoyaltyConfig | null>;
  /** Creates the config with defaults on first write. */
  upsert(
    tenantId: Id,
    patch: Partial<Pick<LoyaltyConfig, 'pointsPerPeso' | 'pesoPerPoint' | 'minRedemption' | 'isEnabled'>>
  ): Promise<LoyaltyConfig>;
}

export interface LookupRepos {
  categories: CategoryRepo;
  branches: BranchRepo;
  devices: DeviceRepo;
  tables: DiningTableRepo;
  expenses: ExpenseRepo;
  discounts: DiscountRepo;
  coupons: CouponRepo;
  featureFlagOverrides: FeatureFlagOverrideRepo;
  loyaltyConfigs: LoyaltyConfigRepo;
}
