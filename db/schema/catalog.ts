/**
 * Catalog domain: categories, products (+ variations and per-branch stock),
 * bundles, e-commerce channel listings and tax rules.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { id, money, objectId, quantity, rate, tenantId, timestamps, timestamptz } from './_columns';
import { branches } from './org';

// models/Category.ts
// Delete guard (pre findOneAndDelete/deleteOne) → products.category_id is ON DELETE RESTRICT.
export const categories = pgTable(
  'categories',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [uniqueIndex('categories_tenant_name_key').on(t.tenantId, t.name)]
);

export const PRODUCT_TYPES = ['regular', 'bundle', 'service'] as const;
export const PRODUCT_SERVICE_TYPES = ['wash', 'dry-clean', 'press', 'repair', 'other'] as const;
export const PRODUCT_DRUG_SCHEDULES = ['otc', 'rx', 'dangerous'] as const;

// models/Product.ts
// Repository: pre-validate negative-stock check (stock, variation stock and
// branch stock may only go below 0 when allow_out_of_stock_sales) and the
// delete guard (completed transactions / saved carts reference the product).
export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    description: text('description'),
    price: money('price').notNull(),
    // No CHECK (stock >= 0): negative stock is allowed when allow_out_of_stock_sales
    // is true; the repository enforces it.
    stock: quantity('stock').notNull().default(0),
    sku: text('sku'),
    barcode: text('barcode'),
    // Legacy denormalized category name, kept alongside category_id
    category: text('category'),
    // RESTRICT mirrors the Category delete guard
    categoryId: objectId('category_id').references(() => categories.id),
    image: text('image'),
    productType: text('product_type', { enum: PRODUCT_TYPES }).notNull().default('regular'),
    hasVariations: boolean('has_variations').notNull().default(false),
    taxExempt: boolean('tax_exempt').notNull().default(false),
    zeroRated: boolean('zero_rated').notNull().default(false),
    trackInventory: boolean('track_inventory').notNull().default(true),
    allowOutOfStockSales: boolean('allow_out_of_stock_sales').notNull().default(false),
    lowStockThreshold: quantity('low_stock_threshold'),
    pinned: boolean('pinned').notNull().default(false),

    // Restaurant — always read/written with the product as a whole
    modifiers: jsonb('modifiers')
      .$type<Array<{ name?: string; options: Array<{ name?: string; price: number }>; required: boolean }>>()
      .notNull()
      .default([]),
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    nutritionInfo: jsonb('nutrition_info').$type<{
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
    }>(),

    // Laundry
    serviceType: text('service_type', { enum: PRODUCT_SERVICE_TYPES }),
    weightBased: boolean('weight_based').notNull().default(false),
    pickupDelivery: boolean('pickup_delivery').notNull().default(false),
    // Minutes
    estimatedDuration: integer('estimated_duration'),

    // Service business
    serviceDuration: integer('service_duration'),
    staffRequired: integer('staff_required').notNull().default(1),
    equipmentRequired: text('equipment_required').array().notNull().default(sql`'{}'::text[]`),

    // Pharmacy (PH FDA/DOH/PDEA)
    genericName: text('generic_name'),
    manufacturer: text('manufacturer'),
    prn: text('prn'),
    batchNumber: text('batch_number'),
    expiryDate: timestamptz('expiry_date'),
    drugSchedule: text('drug_schedule', { enum: PRODUCT_DRUG_SCHEDULES }),
    requiresPrescription: boolean('requires_prescription').notNull().default(false),
    storageConditions: text('storage_conditions'),
    activeIngredient: text('active_ingredient'),
    dosageStrength: text('dosage_strength'),
    dosageForm: text('dosage_form'),

    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('products_tenant_sku_key').on(t.tenantId, t.sku).where(sql`${t.sku} IS NOT NULL`),
    uniqueIndex('products_tenant_barcode_key').on(t.tenantId, t.barcode).where(sql`${t.barcode} IS NOT NULL`),
    index('products_tenant_type_track_idx').on(t.tenantId, t.productType, t.trackInventory),
    index('products_tenant_category_idx').on(t.tenantId, t.categoryId),
    index('products_tenant_active_pinned_created_idx').on(t.tenantId, t.isActive, t.pinned.desc(), t.createdAt.desc()),
    index('products_tenant_expiry_date_idx').on(t.tenantId, t.expiryDate),
    index('products_tenant_drug_schedule_idx').on(t.tenantId, t.drugSchedule),
    // $regex search → ILIKE
    index('products_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('products_sku_trgm_idx').using('gin', sql`${t.sku} gin_trgm_ops`),
    index('products_barcode_trgm_idx').using('gin', sql`${t.barcode} gin_trgm_ops`),
    check('products_product_type_check', sql`${t.productType} IN ('regular', 'bundle', 'service')`),
    check(
      'products_service_type_check',
      sql`${t.serviceType} IS NULL OR ${t.serviceType} IN ('wash', 'dry-clean', 'press', 'repair', 'other')`
    ),
    check(
      'products_drug_schedule_check',
      sql`${t.drugSchedule} IS NULL OR ${t.drugSchedule} IN ('otc', 'rx', 'dangerous')`
    ),
    check('products_price_non_negative', sql`${t.price} >= 0`),
    check(
      'products_non_negative_check',
      sql`(${t.lowStockThreshold} IS NULL OR ${t.lowStockThreshold} >= 0)
        AND (${t.estimatedDuration} IS NULL OR ${t.estimatedDuration} >= 0)
        AND (${t.serviceDuration} IS NULL OR ${t.serviceDuration} >= 0)
        AND ${t.staffRequired} >= 0`
    ),
  ]
);

// models/Product.ts — variations[] (subdoc _id kept as id)
export const productVariations = pgTable(
  'product_variations',
  {
    id: id(),
    tenantId: tenantId(),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    size: text('size'),
    color: text('color'),
    type: text('type'),
    sku: text('sku'),
    // Overrides products.price when set
    price: money('price'),
    // No CHECK (stock >= 0): see products.stock
    stock: quantity('stock').notNull().default(0),
  },
  t => [
    index('product_variations_product_position_idx').on(t.productId, t.position),
    // Mongo { tenantId, 'variations.sku' } partial index — POS SKU/barcode scan
    index('product_variations_tenant_sku_idx').on(t.tenantId, t.sku).where(sql`${t.sku} IS NOT NULL`),
    check('product_variations_price_non_negative', sql`${t.price} IS NULL OR ${t.price} >= 0`),
  ]
);

// models/Product.ts — branchStock[]. One row per (product, branch); Mongo did not
// enforce that uniqueness and its subdoc _id is dropped.
export const productBranchStock = pgTable(
  'product_branch_stock',
  {
    tenantId: tenantId(),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    branchId: objectId('branch_id')
      .notNull()
      .references((): AnyPgColumn => branches.id),
    position: integer('position').notNull(),
    // No CHECK (stock >= 0): see products.stock
    stock: quantity('stock').notNull().default(0),
  },
  t => [
    primaryKey({ name: 'product_branch_stock_pkey', columns: [t.productId, t.branchId] }),
    index('product_branch_stock_tenant_branch_idx').on(t.tenantId, t.branchId),
  ]
);

// models/ProductBundle.ts
// Repository: "at least one item" validator.
export const productBundles = pgTable(
  'product_bundles',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    description: text('description'),
    price: money('price').notNull(),
    sku: text('sku'),
    categoryId: objectId('category_id').references(() => categories.id, { onDelete: 'set null' }),
    image: text('image'),
    trackInventory: boolean('track_inventory').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    uniqueIndex('product_bundles_tenant_sku_key').on(t.tenantId, t.sku).where(sql`${t.sku} IS NOT NULL`),
    index('product_bundles_tenant_active_idx').on(t.tenantId, t.isActive),
    index('product_bundles_category_id_idx').on(t.categoryId),
    check('product_bundles_price_non_negative', sql`${t.price} >= 0`),
  ]
);

// models/ProductBundle.ts — items[] (subdoc _id kept as id)
export const productBundleItems = pgTable(
  'product_bundle_items',
  {
    id: id(),
    tenantId: tenantId(),
    bundleId: objectId('bundle_id')
      .notNull()
      .references(() => productBundles.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id),
    productName: text('product_name').notNull(),
    quantity: quantity('quantity').notNull(),
    variationSize: text('variation_size'),
    variationColor: text('variation_color'),
    variationType: text('variation_type'),
  },
  t => [
    index('product_bundle_items_bundle_position_idx').on(t.bundleId, t.position),
    // Supports the RESTRICT check when a product is deleted
    index('product_bundle_items_product_idx').on(t.productId),
    check('product_bundle_items_quantity_min', sql`${t.quantity} >= 1`),
  ]
);

export const PRODUCT_CHANNEL_PROVIDERS = ['shopify', 'woocommerce'] as const;

// models/ProductChannelListing.ts
export const productChannelListings = pgTable(
  'product_channel_listings',
  {
    id: id(),
    tenantId: tenantId(),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id),
    provider: text('provider', { enum: PRODUCT_CHANNEL_PROVIDERS }).notNull(),
    externalProductId: text('external_product_id').notNull(),
    externalVariantId: text('external_variant_id').notNull(),
    // Shopify inventory_items id
    inventoryItemId: text('inventory_item_id'),
    sku: text('sku'),
    // Which POS variation to adjust (matched by values, not by id)
    variationSize: text('variation_size'),
    variationColor: text('variation_color'),
    variationType: text('variation_type'),
    ...timestamps(),
  },
  t => [
    uniqueIndex('product_channel_listings_tenant_provider_variant_key').on(
      t.tenantId,
      t.provider,
      t.externalVariantId
    ),
    index('product_channel_listings_tenant_product_provider_idx').on(t.tenantId, t.productId, t.provider),
    check('product_channel_listings_provider_check', sql`${t.provider} IN ('shopify', 'woocommerce')`),
  ]
);

export const TAX_RULE_APPLIES_TO = ['all', 'products', 'services', 'categories'] as const;

// models/TaxRule.ts
// Repository: invalidateTaxRulesCache() after every write (post save/update/delete hooks).
export const taxRules = pgTable(
  'tax_rules',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    rate: rate('rate').notNull(),
    label: text('label').notNull().default('Tax'),
    appliesTo: text('applies_to', { enum: TAX_RULE_APPLIES_TO }).notNull().default('all'),
    regionCountry: text('region_country'),
    regionState: text('region_state'),
    regionCity: text('region_city'),
    regionZipCodes: text('region_zip_codes').array().notNull().default(sql`'{}'::text[]`),
    priority: integer('priority').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  t => [
    index('tax_rules_tenant_active_priority_idx').on(t.tenantId, t.isActive, t.priority.desc()),
    index('tax_rules_tenant_applies_to_active_idx').on(t.tenantId, t.appliesTo, t.isActive),
    check('tax_rules_applies_to_check', sql`${t.appliesTo} IN ('all', 'products', 'services', 'categories')`),
    check('tax_rules_rate_range', sql`${t.rate} >= 0 AND ${t.rate} <= 100`),
    check('tax_rules_priority_non_negative', sql`${t.priority} >= 0`),
  ]
);

// models/TaxRule.ts — categoryIds[]. CASCADE on the category side: Mongo left a
// dangling id and the Category delete guard only checks products.
export const taxRuleCategories = pgTable(
  'tax_rule_categories',
  {
    tenantId: tenantId(),
    taxRuleId: objectId('tax_rule_id')
      .notNull()
      .references(() => taxRules.id, { onDelete: 'cascade' }),
    categoryId: objectId('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ name: 'tax_rule_categories_pkey', columns: [t.taxRuleId, t.categoryId] }),
    index('tax_rule_categories_category_idx').on(t.categoryId),
  ]
);

// models/TaxRule.ts — productIds[]. CASCADE on the product side, same reasoning.
export const taxRuleProducts = pgTable(
  'tax_rule_products',
  {
    tenantId: tenantId(),
    taxRuleId: objectId('tax_rule_id')
      .notNull()
      .references(() => taxRules.id, { onDelete: 'cascade' }),
    productId: objectId('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  t => [
    primaryKey({ name: 'tax_rule_products_pkey', columns: [t.taxRuleId, t.productId] }),
    index('tax_rule_products_product_idx').on(t.productId),
  ]
);
