/** Rules for product variations, free of database code so the browser can use them too. */

export interface VariationAttributes {
  size?: string;
  color?: string;
  type?: string;
}

export interface VariationRow extends VariationAttributes {
  _id?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

const ATTRIBUTES = ['size', 'color', 'type'] as const;
const MAX_ATTRIBUTE_LENGTH = 100;
const MAX_SKU_LENGTH = 50;

/** An attribute left unset on the option matches anything, which is how stock looks variations up. */
export function matchesVariation(variation: VariationAttributes, option: VariationAttributes): boolean {
  return ATTRIBUTES.every((key) => !option[key] || variation[key] === option[key]);
}

export function variationLabel(variation: VariationAttributes & { sku?: string }): string {
  return ATTRIBUTES.map((key) => variation[key]).filter(Boolean).join(' / ') || variation.sku || '';
}

interface StockedProduct {
  stock?: number;
  hasVariations?: boolean;
  variations?: Array<{ stock?: number }> | null;
}

/** Once a product has variations, sales and refills use their stock and the main figure goes unused. */
export function usesVariationStock(product: StockedProduct): boolean {
  return Boolean(product.hasVariations && product.variations?.length);
}

/** Sales of a variation only touch that variation, so its stock is what's really on the shelf. */
export function productStockTotal(product: StockedProduct): number {
  if (usesVariationStock(product)) {
    return (product.variations ?? []).reduce((sum, variation) => sum + (variation.stock ?? 0), 0);
  }
  return product.stock ?? 0;
}

/** The variation a scanned code belongs to. Case is ignored, as it is when saving SKUs. */
export function findVariationBySku<T extends { sku?: string }>(
  product: { hasVariations?: boolean; variations?: T[] | null },
  code: string
): T | undefined {
  if (!product.hasVariations) return undefined;
  const folded = code.toLowerCase();
  return product.variations?.find((variation) => variation.sku?.toLowerCase() === folded);
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Tidies what a form sent. Returns null if it isn't a list at all. */
export function normalizeVariationRows(raw: unknown): VariationRow[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((row: Record<string, unknown>) => {
    const price = row?.price;
    const stock = row?.stock;
    const hasPrice = price !== undefined && price !== null && price !== '';
    const hasStock = stock !== undefined && stock !== null && stock !== '';
    return {
      ...(row?._id ? { _id: String(row._id) } : {}),
      ...(text(row?.size) ? { size: text(row.size) } : {}),
      ...(text(row?.color) ? { color: text(row.color) } : {}),
      ...(text(row?.type) ? { type: text(row.type) } : {}),
      ...(text(row?.sku) ? { sku: text(row.sku) } : {}),
      ...(hasPrice ? { price: Number(price) } : {}),
      ...(hasStock ? { stock: Number(stock) } : {}),
    };
  });
}

export type VariationProblemCode =
  | 'attribute_required'
  | 'too_long'
  | 'invalid_price'
  | 'invalid_stock'
  | 'overlap'
  | 'duplicate_sku'
  | 'unknown_variation'
  | 'remove_with_stock';

export interface VariationProblem {
  code: VariationProblemCode;
  label: string;
}

const fold = (variation: VariationAttributes) =>
  Object.fromEntries(ATTRIBUTES.map((key) => [key, variation[key]?.toLowerCase()])) as VariationAttributes;

/**
 * "L" and "L / Red" can't sit together: a sale of "L" could land on either,
 * because unset attributes match anything. Case is ignored so "red" and "Red" clash too.
 */
export function variationsOverlap(a: VariationAttributes, b: VariationAttributes): boolean {
  const [first, second] = [fold(a), fold(b)];
  return matchesVariation(first, second) || matchesVariation(second, first);
}

export interface ExistingVariation {
  _id?: unknown;
  stock?: number;
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
}

/** The first thing wrong with a set of rows, checked against what the product has now. */
export function findVariationProblem(rows: VariationRow[], existing: ExistingVariation[] = []): VariationProblem | null {
  const existingIds = new Set(existing.map((variation) => String(variation._id)));

  for (const row of rows) {
    const label = variationLabel(row);
    if (!ATTRIBUTES.some((key) => row[key])) return { code: 'attribute_required', label };
    if (ATTRIBUTES.some((key) => (row[key]?.length ?? 0) > MAX_ATTRIBUTE_LENGTH) || (row.sku?.length ?? 0) > MAX_SKU_LENGTH) {
      return { code: 'too_long', label };
    }
    if (row.price !== undefined && !(Number.isFinite(row.price) && row.price >= 0)) return { code: 'invalid_price', label };
    if (row._id && !existingIds.has(row._id)) return { code: 'unknown_variation', label };
    // Stock on an existing variation is ignored, so only a new row's value matters
    if (!row._id && row.stock !== undefined && !(Number.isInteger(row.stock) && row.stock >= 0)) {
      return { code: 'invalid_stock', label };
    }
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (variationsOverlap(rows[i], rows[j])) return { code: 'overlap', label: variationLabel(rows[j]) };
      if (rows[i].sku && rows[i].sku?.toLowerCase() === rows[j].sku?.toLowerCase()) {
        return { code: 'duplicate_sku', label: rows[j].sku ?? '' };
      }
    }
  }

  const kept = new Set(rows.flatMap((row) => (row._id ? [row._id] : [])));
  const stocked = existing.find((variation) => !kept.has(String(variation._id)) && (variation.stock ?? 0) > 0);
  if (stocked) return { code: 'remove_with_stock', label: variationLabel(stocked) };

  return null;
}
