import type mongoose from 'mongoose';
import Product from '@/models/Product';
import ProductBundle from '@/models/ProductBundle';
import {
  updateStock,
  updateBundleStock,
  insertStockMovements,
  STOCK_SNAPSHOT_FIELDS,
  type StockMovementInput,
  type StockProductSnapshot,
} from '@/lib/stock';
import { matchesVariation } from '@/lib/product-variations';

type Variation = { size?: string; color?: string; type?: string };

export interface StockReturnLine {
  /** A product's id, or a bundle's on bundle lines. */
  id: string;
  quantity: number;
  variation?: Variation;
}

interface StockReturnOptions {
  tenantId: string;
  lines: StockReturnLine[];
  /** The sale's branch, so stock goes back where it came from. */
  branchId?: string;
  transactionId: string;
  userId?: string;
  reason: string;
  notes?: string;
}

/** Sale lines hold Mongoose subdocuments, while stock updates and movements want plain values. */
function plainVariation(variation?: Variation): Variation | undefined {
  if (!variation) return undefined;
  const { size, color, type } = variation;
  return { ...(size ? { size } : {}), ...(color ? { color } : {}), ...(type ? { type } : {}) };
}

/**
 * Puts sold goods back on the shelf, each line in the variation and branch it left from.
 * Lines for the same product and variation are combined. Returns the ids it was given.
 */
export async function returnStockLines(
  { tenantId, lines, branchId, transactionId, userId, reason, notes }: StockReturnOptions,
  session?: mongoose.ClientSession
): Promise<string[]> {
  const combined = new Map<string, StockReturnLine>();
  for (const line of lines) {
    const variation = plainVariation(line.variation);
    const key = `${line.id}:${JSON.stringify(variation ?? null)}`;
    const existing = combined.get(key);
    if (existing) existing.quantity += line.quantity;
    else combined.set(key, { id: line.id, quantity: line.quantity, variation });
  }

  const ids = [...new Set(lines.map((line) => line.id))];
  if (ids.length === 0) return [];

  const productsQuery = Product.find({ _id: { $in: ids }, tenantId })
    .select(STOCK_SNAPSHOT_FIELDS)
    .lean<Array<StockProductSnapshot & { _id: { toString(): string } }>>();
  if (session) productsQuery.session(session);
  const products = new Map((await productsQuery).map((product) => [product._id.toString(), product]));

  // Anything left is a bundle line, which returns its component products
  const bundleIds = ids.filter((id) => !products.has(id));
  const bundles = new Map<string, Awaited<ReturnType<typeof loadBundles>>[number]>();
  if (bundleIds.length > 0) {
    for (const bundle of await loadBundles(bundleIds, tenantId, session)) bundles.set(bundle._id.toString(), bundle);
  }

  const movements: StockMovementInput[] = [];
  const options = { userId, branchId, transactionId, reason, notes, movements };

  try {
    for (const { id, quantity, variation } of combined.values()) {
      const product = products.get(id);
      if (product) {
        if (product.trackInventory !== false) {
          // A variation renamed or removed since the sale can't take it back, so main stock does
          const known = !variation || !product.hasVariations || product.variations?.some((v) => matchesVariation(v, variation));
          await updateStock(id, tenantId, quantity, 'return', { ...options, variation: known ? variation : undefined, product }, session);
        }
      } else if (bundles.has(id)) {
        await updateBundleStock(id, tenantId, quantity, 'return', options, session, { bundle: bundles.get(id) });
      }
    }
  } catch (error) {
    // Without a MongoDB transaction, stock already returned stays returned, so keep its records
    if (!session) await insertStockMovements(movements);
    throw error;
  }
  await insertStockMovements(movements, session);

  return ids;
}

function loadBundles(ids: string[], tenantId: string, session?: mongoose.ClientSession) {
  const query = ProductBundle.find({ _id: { $in: ids }, tenantId }).select('name trackInventory items').lean();
  if (session) query.session(session);
  return query;
}
