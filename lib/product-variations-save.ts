import { Types } from 'mongoose';
import Product from '@/models/Product';
import { escapeRegex } from '@/lib/query-utils';
import type { ExistingVariation, VariationProblemCode, VariationRow } from '@/lib/product-variations';

type Translate = (key: string, fallback: string) => string;

export function variationProblemMessage(code: VariationProblemCode, label: string, t: Translate): string {
  const messages: Record<VariationProblemCode, string> = {
    attribute_required: t('validation.variationAttributeRequired', 'Each variation needs a size, color or type'),
    too_long: t('validation.variationTooLong', 'Variation "{label}" has a value that is too long'),
    invalid_price: t('validation.variationInvalidPrice', 'Variation "{label}" has an invalid price'),
    invalid_stock: t('validation.variationInvalidStock', 'Stock for "{label}" must be a whole number, 0 or more'),
    overlap: t('validation.variationOverlap', 'Variation "{label}" is the same as, or too close to, another one. Fill in the same details on every variation.'),
    duplicate_sku: t('validation.variationDuplicateSku', 'SKU "{label}" is already used'),
    unknown_variation: t('validation.variationChanged', 'This product changed while you were editing. Reopen it and try again.'),
    remove_with_stock: t('validation.variationRemoveWithStock', 'Variation "{label}" still has stock, so it cannot be removed'),
  };
  return messages[code].replace('{label}', label);
}

/** A variation's SKU has to be free across the tenant, on main products and on variations. */
export async function findTakenVariationSku(tenantId: string, rows: VariationRow[], productId?: string): Promise<string | null> {
  const skus = rows.flatMap((row) => (row.sku ? [row.sku] : []));
  if (skus.length === 0) return null;

  const patterns = skus.map((sku) => new RegExp(`^${escapeRegex(sku)}$`, 'i'));
  const others = await Product.find({
    tenantId,
    ...(productId ? { _id: { $ne: productId } } : {}),
    $or: [{ sku: { $in: patterns } }, { 'variations.sku': { $in: patterns } }],
  }).select('sku variations.sku').lean();

  const taken = new Set(others.flatMap((product) => [product.sku, ...(product.variations ?? []).map((variation) => variation.sku)])
    .flatMap((sku) => (sku ? [sku.toLowerCase()] : [])));
  return skus.find((sku) => taken.has(sku.toLowerCase())) ?? null;
}

const DESCRIPTION_FIELDS = ['size', 'color', 'type', 'sku', 'price'] as const;

/** The stored form of a new row. Stock starts at what was entered, or 0. */
export function newVariation(row: VariationRow) {
  const { size, color, type, sku, price, stock } = row;
  return {
    _id: new Types.ObjectId(),
    ...(size ? { size } : {}),
    ...(color ? { color } : {}),
    ...(type ? { type } : {}),
    ...(sku ? { sku } : {}),
    ...(price !== undefined ? { price } : {}),
    stock: stock ?? 0,
  };
}

/**
 * Applies edits one variation at a time rather than replacing the list, so a sale or
 * refill that lands while the form was open keeps its stock. Existing stock is never
 * written here: it only moves through stock updates, which leave a movement record.
 * A removal only goes through while the variation is still empty.
 */
export async function saveVariationRows(tenantId: string, productId: string, rows: VariationRow[], existing: ExistingVariation[]) {
  const target = { _id: productId, tenantId };
  const kept = new Set(rows.flatMap((row) => (row._id ? [row._id] : [])));
  const removed = existing.filter((variation) => !kept.has(String(variation._id)));
  const added = rows.filter((row) => !row._id).map(newVariation);

  const edits = rows.flatMap((row) => {
    if (!row._id) return [];
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const field of DESCRIPTION_FIELDS) {
      const value = row[field];
      if (value === undefined) $unset[`variations.$.${field}`] = '';
      else $set[`variations.$.${field}`] = value;
    }
    return [{
      updateOne: {
        filter: { ...target, 'variations._id': row._id },
        update: { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      },
    }];
  });

  await Product.bulkWrite([
    ...removed.map((variation) => ({
      updateOne: { filter: target, update: { $pull: { variations: { _id: variation._id, stock: { $in: [0, null] } } } } },
    })),
    ...edits,
    ...(added.length > 0 ? [{ updateOne: { filter: target, update: { $push: { variations: { $each: added } } } } }] : []),
  ] as Parameters<typeof Product.bulkWrite>[0]);

  const saved = await Product.findOne(target).select('variations').lean();
  const hasVariations = (saved?.variations?.length ?? 0) > 0;
  await Product.updateOne(target, { $set: { hasVariations } });

  return { added: added.length, removed: removed.length, updated: edits.length };
}
