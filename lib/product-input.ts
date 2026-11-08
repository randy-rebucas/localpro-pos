/**
 * What the product create/edit routes may write, and how emptied fields clear.
 *
 * The routes used to spread the whole request body into the product, so a
 * caller could set branchStock (skipping the stock-movement ledger), isActive,
 * pinned or a categoryId from another tenant. Only the fields below go through;
 * stock, variations, branch stock, status and pinning each have their own path.
 */
import mongoose from 'mongoose';
import Category from '@/models/Category';

export const PRODUCT_WRITABLE_FIELDS = [
  'name', 'description', 'price', 'sku', 'barcode', 'categoryId', 'image', 'productType',
  'taxExempt', 'zeroRated', 'trackInventory', 'allowOutOfStockSales', 'lowStockThreshold',
  // restaurant
  'modifiers', 'allergens', 'nutritionInfo',
  // laundry
  'serviceType', 'weightBased', 'pickupDelivery', 'estimatedDuration',
  // service
  'serviceDuration', 'staffRequired', 'equipmentRequired',
  // pharmacy
  'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate', 'drugSchedule',
  'requiresPrescription', 'storageConditions', 'activeIngredient', 'dosageStrength', 'dosageForm',
] as const;

/**
 * Optional fields that an edit clears when sent as '' or null. They are unset
 * rather than stored empty: sku and barcode have tenant-unique indexes on any
 * string value, so two products with sku '' would collide.
 */
export const CLEARABLE_PRODUCT_FIELDS = new Set<string>([
  'description', 'sku', 'barcode', 'categoryId', 'image', 'lowStockThreshold',
  'nutritionInfo', 'serviceType', 'estimatedDuration', 'serviceDuration',
  'genericName', 'manufacturer', 'prn', 'batchNumber', 'expiryDate', 'drugSchedule',
  'storageConditions', 'activeIngredient', 'dosageStrength', 'dosageForm',
]);

/** Array fields an edit may empty (sent as []). Kept as [] — no index involved. */
const ARRAY_FIELDS = new Set(['modifiers', 'allergens', 'equipmentRequired']);

export interface ProductFieldSplit {
  /** Fields to $set (create: the document fields). */
  set: Record<string, unknown>;
  /** Fields to $unset on edit (empty on create — they are simply left out). */
  unset: string[];
}

/** Picks the writable fields out of a (validated, sanitized) request body. */
export function pickProductFields(data: Record<string, unknown>): ProductFieldSplit {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const field of PRODUCT_WRITABLE_FIELDS) {
    if (!(field in data)) continue;
    const value = data[field];
    if (value === undefined) continue;
    const empty = value === null || (typeof value === 'string' && value.trim() === '');
    if (empty && CLEARABLE_PRODUCT_FIELDS.has(field)) {
      unset.push(field);
      continue;
    }
    if (ARRAY_FIELDS.has(field) && value !== null && !Array.isArray(value)) continue;
    set[field] = typeof value === 'string' ? value.trim() : value;
  }
  return { set, unset };
}

/**
 * Checks a categoryId belongs to the tenant. Returns the category's name (the
 * product keeps a denormalised copy) or null when it is not the tenant's.
 */
export async function findTenantCategory(
  tenantId: string,
  categoryId: unknown
): Promise<{ _id: string; name: string } | null> {
  if (typeof categoryId !== 'string' || !mongoose.isValidObjectId(categoryId)) return null;
  const category = await Category.findOne({ _id: categoryId, tenantId, isActive: { $ne: false } })
    .select('name')
    .lean<{ _id: unknown; name: string }>();
  return category ? { _id: String(category._id), name: category.name } : null;
}
