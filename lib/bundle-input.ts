/**
 * Validation for bundle create/edit.
 *
 * Every item must be one of the tenant's own active products (GET populates
 * items.productId with name/price/stock, so a foreign id would read another
 * tenant's catalogue), and an item whose product has variations must name one:
 * bundle stock is taken from that variation (lib/stock.ts updateBundleStock),
 * and without it the sale fell through to the unused main stock figure.
 * productName is copied from the product, not trusted from the client.
 */
import mongoose from 'mongoose';
import Product from '@/models/Product';
import { matchesVariation } from '@/lib/product-variations';
import { findTenantCategory } from '@/lib/product-input';

type Translate = (key: string, fallback: string) => string;

export const MAX_BUNDLE_ITEMS = 50;
const VARIATION_KEYS = ['size', 'color', 'type'] as const;

export interface BundleItemInput {
  productId: string;
  productName: string;
  quantity: number;
  variation?: { size?: string; color?: string; type?: string };
}

export interface BundleWrite {
  set: Record<string, unknown>;
  unset: string[];
}

export type BundleInputResult = { ok: true; value: BundleWrite } | { ok: false; error: string };

function cleanVariation(raw: unknown): BundleItemInput['variation'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const key of VARIATION_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * `partial` (edit): only fields present in the body are written; '' or null
 * clears description, sku, categoryId and image. Create requires name, price
 * and items.
 */
export async function parseBundleInput(
  body: Record<string, unknown>,
  tenantId: string,
  t: Translate,
  { partial }: { partial: boolean }
): Promise<BundleInputResult> {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const has = (key: string) => body[key] !== undefined;
  const fail = (error: string): BundleInputResult => ({ ok: false, error });
  const required = t('validation.bundleFieldsRequired', 'Name, price, and at least one item are required');

  if (has('name') || !partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) return fail(required);
    if (body.name.trim().length > 200) return fail(t('validation.valueTooLong', 'Value is too long'));
    set.name = body.name.trim();
  }

  if (has('price') || !partial) {
    const price = typeof body.price === 'string' && body.price.trim() !== '' ? Number(body.price) : body.price;
    // 0 is a valid price (a free promo bundle); only missing/negative/NaN fail
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return fail(has('price') ? t('validation.pricePositive', 'Price must be a positive number') : required);
    }
    set.price = Math.round(price * 100) / 100;
  }

  if (has('items') || !partial) {
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) return fail(required);
    if (rawItems.length > MAX_BUNDLE_ITEMS) return fail(t('validation.bundleTooManyItems', 'A bundle can hold at most 50 items'));

    const ids: string[] = [];
    for (const raw of rawItems) {
      const productId = raw && typeof raw === 'object' ? String((raw as Record<string, unknown>).productId ?? '') : '';
      if (!mongoose.isValidObjectId(productId)) return fail(t('validation.bundleProductNotFound', 'A product in this bundle was not found'));
      ids.push(productId);
    }

    const products = await Product.find({ _id: { $in: ids }, tenantId, isActive: { $ne: false } })
      .select('name hasVariations variations')
      .lean<Array<{ _id: unknown; name: string; hasVariations?: boolean; variations?: Array<{ size?: string; color?: string; type?: string; sku?: string }> }>>();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items: BundleItemInput[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i] as Record<string, unknown>;
      const product = byId.get(ids[i]);
      if (!product) return fail(t('validation.bundleProductNotFound', 'A product in this bundle was not found'));

      const quantity = Number(raw.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
        return fail(t('validation.bundleQuantityInvalid', 'Each item needs a whole quantity of at least 1'));
      }

      const item: BundleItemInput = { productId: ids[i], productName: product.name, quantity };
      const variations = product.hasVariations ? product.variations ?? [] : [];
      if (variations.length) {
        const variation = cleanVariation(raw.variation);
        const match = variation && variations.find((v) => matchesVariation(v, variation));
        if (!match) {
          return fail(
            t('validation.bundleVariationRequired', 'Choose which variation of {product} goes in the bundle').replace('{product}', product.name)
          );
        }
        // Store the full attributes of the matched variation, so stock lookups are exact
        item.variation = cleanVariation(match);
      }
      items.push(item);
    }
    set.items = items;
  }

  for (const key of ['description', 'sku', 'image'] as const) {
    if (!has(key)) continue;
    const value = body[key];
    if (value === null || (typeof value === 'string' && !value.trim())) {
      if (partial) unset.push(key);
      continue;
    }
    if (typeof value !== 'string') return fail(t('validation.invalidValue', 'Invalid value'));
    if (value.trim().length > (key === 'description' ? 2000 : 500)) return fail(t('validation.valueTooLong', 'Value is too long'));
    if (key === 'image' && !/^https?:\/\//.test(value.trim())) return fail(t('validation.imageUrlInvalid', 'Image must be a valid HTTP/HTTPS URL'));
    set[key] = value.trim();
  }

  if (has('categoryId')) {
    if (body.categoryId === null || body.categoryId === '') {
      if (partial) unset.push('categoryId');
    } else {
      const category = await findTenantCategory(tenantId, body.categoryId);
      if (!category) return fail(t('validation.categoryNotFound', 'Category not found'));
      set.categoryId = category._id;
    }
  }

  if (has('trackInventory')) {
    if (typeof body.trackInventory !== 'boolean') return fail(t('validation.invalidValue', 'Invalid value'));
    set.trackInventory = body.trackInventory;
  } else if (!partial) {
    set.trackInventory = true;
  }

  return { ok: true, value: { set, unset } };
}
