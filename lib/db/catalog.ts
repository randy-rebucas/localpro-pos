/**
 * Domain 4 (catalog): products (with variations and per-branch stock),
 * bundles, e-commerce channel listings and tax rules.
 *
 * Every method takes `tenantId` first and scopes by it. Categories belong to
 * domain 1 (lookup.ts). Stock movements are written by lib/stock.ts and move
 * with the sales core.
 */
import type { DbTx } from './tx';
import type { Id, Patch, Ref, UpdateResult } from './types';
import type { Select } from './identity';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

type DateRange = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };
type NumberRange = { gte?: number; lte?: number };

/** Identifies a variation by its values; an omitted value matches anything. */
export interface VariationOption {
  size?: string;
  color?: string;
  type?: string;
}

// ─── Products ───────────────────────────────────────────────────────────────

export const PRODUCT_TYPES = ['regular', 'bundle', 'service'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export interface ProductVariation extends VariationOption {
  _id: Id;
  sku?: string;
  /** Overrides the product price when set. */
  price?: number;
  stock: number;
}

export interface BranchStock {
  branchId: Id;
  stock: number;
}

export interface ProductModifier {
  name: string;
  options: Array<{ name: string; price: number }>;
  required: boolean;
}

export interface Product extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  description?: string;
  price: number;
  /** Master stock, used when there are no branch or variation entries. */
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  categoryId?: Id;
  image?: string;
  productType: ProductType;
  hasVariations: boolean;
  variations: ProductVariation[];
  branchStock: BranchStock[];
  taxExempt: boolean;
  zeroRated: boolean;
  trackInventory: boolean;
  allowOutOfStockSales: boolean;
  lowStockThreshold?: number;
  pinned: boolean;

  // Restaurant
  modifiers: ProductModifier[];
  allergens: string[];
  nutritionInfo?: { calories?: number; protein?: number; carbs?: number; fat?: number };
  // Laundry
  serviceType?: 'wash' | 'dry-clean' | 'press' | 'repair' | 'other';
  weightBased: boolean;
  pickupDelivery: boolean;
  estimatedDuration?: number;
  // Services
  serviceDuration?: number;
  staffRequired: number;
  equipmentRequired: string[];
  // Pharmacy
  genericName?: string;
  manufacturer?: string;
  prn?: string;
  batchNumber?: string;
  expiryDate?: Date;
  drugSchedule?: 'otc' | 'rx' | 'dangerous';
  requiresPrescription: boolean;
  storageConditions?: string;
  activeIngredient?: string;
  dosageStrength?: string;
  dosageForm?: string;

  isActive: boolean;
}

/** A product read with `populateCategory`: categoryId is `{ _id, name }`, or null when the category is gone. */
export type ProductWithCategory = Omit<Product, 'categoryId'> & { categoryId?: Ref<{ name: string }> };

/** The fields create/update may write. Variations get their _id from the repository. */
export type ProductFields = Omit<Product, '_id' | 'tenantId' | 'variations' | keyof Timestamps> & {
  variations: Array<Omit<ProductVariation, '_id' | 'stock'> & { _id?: Id; stock?: number }>;
};

/** Missing fields get the schema defaults. `_id` may be pre-assigned (bulk imports). */
export type ProductInput = Pick<ProductFields, 'name' | 'price'> & Partial<ProductFields> & { _id?: Id };

export type ProductPatch = Patch<ProductFields>;

/**
 * A structured product filter. Every given condition must hold. String
 * matches on name/search/code are case-insensitive where noted and always
 * treat the input literally (no regex).
 */
export interface ProductFilter {
  ids?: Id[];
  excludeId?: Id;
  /** true: isActive !== false (a missing value counts as active); false: isActive === false; 'flagged': isActive === true. */
  active?: boolean | 'flagged';
  /** Case-insensitive exact name. */
  name?: string;
  /** Case-insensitive substring of any of `searchFields` (default name, description, sku, barcode). */
  search?: string;
  searchFields?: Array<'name' | 'description' | 'sku' | 'barcode'>;
  /** barcode or sku equals `code` (case-insensitive with `codeInsensitive`). */
  code?: string;
  codeInsensitive?: boolean;
  /** Exact sku. */
  sku?: string;
  /** Own sku in the list, or a variation sku in the list on a product with variations. */
  skuOrVariationSkuIn?: string[];
  /** The field is missing, null or blank. */
  missing?: 'barcode' | 'image';
  category?: string;
  categoryId?: Id;
  productType?: ProductType;
  trackInventory?: boolean;
  /** trackInventory !== false. */
  tracksInventory?: true;
  /** stock > 0 or allowOutOfStockSales. */
  sellable?: true;
  /** At least one branch stock entry. */
  hasBranchStock?: true;
  /** A range here also requires expiryDate to be set. */
  expiryDate?: DateRange;
  /** Only with expiryDate set (any value). */
  hasExpiryDate?: true;
  drugSchedule?: NonNullable<Product['drugSchedule']>;
}

/** catalog: pinned first, then newest. */
export type ProductSort = 'catalog' | 'name' | 'expiryDate' | 'updatedAt';

export interface ProductListOptions {
  /** Projection hint (Mongoose `.select()` syntax); callers read only the selected fields. */
  select?: Select;
  sort?: ProductSort;
  page?: { skip: number; limit: number };
  populateCategory?: boolean;
  tx?: DbTx;
}

/** What adjustStock changes. */
export type StockTarget =
  | { kind: 'master' }
  | { kind: 'variation'; variationId: Id }
  | { kind: 'branch'; branchId: Id }
  /** Adds a branch entry starting at `quantity`; fails if the branch already has one. */
  | { kind: 'newBranch'; branchId: Id };

/** The stock fields a stock read or adjustment returns. */
export type ProductStock = Pick<Product, '_id' | 'stock' | 'branchStock'> & {
  variations: Array<Pick<ProductVariation, '_id' | 'stock'>>;
};

export interface ProductRepo {
  list(tenantId: Id, filter?: ProductFilter, opts?: ProductListOptions): Promise<ProductWithCategory[]>;
  count(tenantId: Id, filter?: ProductFilter): Promise<number>;
  exists(tenantId: Id, filter: ProductFilter): Promise<boolean>;
  /** The first match (no particular order). */
  findOne(tenantId: Id, filter: ProductFilter, opts?: { select?: Select; tx?: DbTx }): Promise<Product | null>;
  findById(tenantId: Id, id: Id, opts?: { select?: Select; activeOnly?: boolean; tx?: DbTx }): Promise<Product | null>;
  /**
   * Candidates for the low-stock check: tracked, active products with
   * variations, or whose master stock is at most the threshold (`threshold`,
   * else lowStockThreshold when > 0, else 10), or with an entry for `branchId`.
   */
  listLowStockCandidates(tenantId: Id, opts: { branchId?: Id; threshold?: number; select: Select }): Promise<Product[]>;
  /**
   * Runs the stock and value validators. Throws DuplicateKeyError for a
   * taken sku or barcode (DuplicateKeyError.field says which).
   */
  create(tenantId: Id, input: ProductInput): Promise<Product>;
  /**
   * Unordered bulk insert. Never throws for rejected rows: returns the ids
   * that were stored, plus the error when some were not.
   */
  createMany(tenantId: Id, inputs: ProductInput[]): Promise<{ insertedIds: Id[]; error?: unknown }>;
  /** Field validators run; the negative-stock check does not (use adjustStock for stock). */
  update(tenantId: Id, id: Id, patch: ProductPatch, opts?: { tx?: DbTx }): Promise<UpdateResult<Product> | null>;
  /** Sets the same fields on every match; returns how many changed. */
  updateMany(tenantId: Id, filter: ProductFilter, set: ProductPatch): Promise<number>;
  /** Different fields per product, in one unordered batch. Returns how many changed. */
  updateEach(tenantId: Id, updates: Array<{ id: Id; set: ProductPatch }>): Promise<number>;
  /** price = max(0, price × (1 + value/100)) or max(0, price + value), per product. Returns how many changed. */
  adjustPrices(tenantId: Id, ids: Id[], change: { mode: 'percent' | 'add'; value: number }): Promise<number>;
  /** Soft delete: isActive true → false. Null when no active product matched. */
  softDelete(tenantId: Id, id: Id): Promise<Product | null>;
  /**
   * Atomically adds `quantity` (may be negative) to one stock figure and
   * returns the new stock fields. Returns null when the condition fails:
   * the product or target is missing, a `newBranch` target already exists,
   * or (unless `allowNegative`) the result would be below zero.
   */
  adjustStock(
    tenantId: Id,
    id: Id,
    target: StockTarget,
    quantity: number,
    opts: { allowNegative: boolean; tx?: DbTx }
  ): Promise<ProductStock | null>;
}

// ─── Bundles ────────────────────────────────────────────────────────────────

export interface BundleItem {
  _id?: Id;
  productId: Id;
  productName: string;
  quantity: number;
  variation?: VariationOption;
}

export interface ProductBundle extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  description?: string;
  price: number;
  items: BundleItem[];
  sku?: string;
  categoryId?: Id;
  image?: string;
  trackInventory: boolean;
  isActive: boolean;
}

/** With `populate`: items[].productId is `{ _id, name, price, stock }` and categoryId `{ _id, name }`. */
export type PopulatedBundle = Omit<ProductBundle, 'items' | 'categoryId'> & {
  items: Array<Omit<BundleItem, 'productId'> & { productId: Ref<{ name: string; price: number; stock: number }> }>;
  categoryId?: Ref<{ name: string }>;
};

export type BundleInput = Pick<ProductBundle, 'name' | 'price' | 'items'> &
  Partial<Pick<ProductBundle, 'description' | 'sku' | 'categoryId' | 'image' | 'trackInventory' | 'isActive'>>;

export interface BundleFilter {
  ids?: Id[];
  /** Case-insensitive substring of name, description or sku. */
  search?: string;
  /** Exact isActive. */
  isActive?: boolean;
  categoryId?: Id;
  price?: NumberRange;
  createdAt?: DateRange;
}

export interface BundleRepo {
  /** Newest first. */
  list(tenantId: Id, filter?: BundleFilter, opts?: { populate?: boolean; select?: Select }): Promise<PopulatedBundle[]>;
  findById(tenantId: Id, id: Id, opts?: { populate?: boolean; select?: Select; tx?: DbTx }): Promise<PopulatedBundle | null>;
  /** Throws DuplicateKeyError for a taken sku; rejects an empty item list. */
  create(tenantId: Id, input: BundleInput): Promise<ProductBundle>;
  update(tenantId: Id, id: Id, patch: Patch<BundleInput>): Promise<UpdateResult<ProductBundle> | null>;
  /** Returns how many changed. */
  setActiveMany(tenantId: Id, ids: Id[], isActive: boolean): Promise<number>;
}

// ─── E-commerce channel listings ────────────────────────────────────────────

export const CHANNEL_PROVIDERS = ['shopify', 'woocommerce'] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export interface ChannelListing extends Timestamps {
  _id: Id;
  tenantId: Id;
  productId: Id;
  provider: ChannelProvider;
  externalProductId: string;
  externalVariantId: string;
  inventoryItemId?: string;
  sku?: string;
  variation?: VariationOption;
}

export type ChannelListingFields = Pick<ChannelListing, 'productId' | 'externalProductId'> &
  Partial<Pick<ChannelListing, 'inventoryItemId' | 'sku' | 'variation'>>;

export interface ChannelListingRepo {
  list(
    tenantId: Id,
    filter: { provider?: ChannelProvider; productIds?: Id[]; externalVariantIds?: string[] },
    opts?: { select?: Select }
  ): Promise<ChannelListing[]>;
  findByProduct(tenantId: Id, productId: Id, provider: ChannelProvider): Promise<ChannelListing | null>;
  /** Creates or replaces the product's listing for the provider. */
  upsertForProduct(
    tenantId: Id,
    productId: Id,
    provider: ChannelProvider,
    fields: Pick<ChannelListing, 'externalProductId' | 'externalVariantId'> & Partial<Pick<ChannelListing, 'inventoryItemId'>>
  ): Promise<void>;
  /**
   * Upserts by externalVariantId, unordered. Never throws for rejected rows:
   * `failedIndexes` lists the rejected items, or is null when the driver
   * couldn't say which (treat all as failed).
   */
  upsertManyByVariant(
    tenantId: Id,
    provider: ChannelProvider,
    items: Array<{ externalVariantId: string; set: ChannelListingFields }>
  ): Promise<{ error?: unknown; failedIndexes: number[] | null }>;
  deleteForProvider(tenantId: Id, provider: ChannelProvider): Promise<void>;
}

// ─── Tax rules ──────────────────────────────────────────────────────────────

export const TAX_RULE_APPLIES_TO = ['all', 'products', 'services', 'categories'] as const;

export interface TaxRule extends Timestamps {
  _id: Id;
  tenantId: Id;
  name: string;
  /** Percent, 0–100. */
  rate: number;
  label: string;
  appliesTo: (typeof TAX_RULE_APPLIES_TO)[number];
  categoryIds: Id[];
  productIds: Id[];
  region?: { country?: string; state?: string; city?: string; zipCodes?: string[] };
  priority: number;
  isActive: boolean;
}

export type TaxRuleInput = Pick<TaxRule, 'name' | 'rate'> &
  Partial<Pick<TaxRule, 'label' | 'appliesTo' | 'categoryIds' | 'productIds' | 'region' | 'priority' | 'isActive'>>;

export interface TaxRuleRepo {
  /** Highest priority first, then newest. */
  list(tenantId: Id, filter?: { isActive?: boolean }): Promise<TaxRule[]>;
  findById(tenantId: Id, id: Id): Promise<TaxRule | null>;
  create(tenantId: Id, input: TaxRuleInput): Promise<TaxRule>;
  /** Validators run. Invalidates the tenant's cached tax rules. */
  update(tenantId: Id, id: Id, patch: Patch<TaxRuleInput>): Promise<UpdateResult<TaxRule> | null>;
  /** Hard delete; returns the deleted rule. */
  delete(tenantId: Id, id: Id): Promise<TaxRule | null>;
}

export interface CatalogRepos {
  products: ProductRepo;
  bundles: BundleRepo;
  channelListings: ChannelListingRepo;
  taxRules: TaxRuleRepo;
}
