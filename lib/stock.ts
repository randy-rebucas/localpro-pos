import mongoose from 'mongoose';
import connectDB from './mongodb';
import Product from '@/models/Product';
import ProductBundle from '@/models/ProductBundle';
import StockMovement from '@/models/StockMovement';
import { logger } from '@/lib/logger';
import { matchesVariation } from '@/lib/product-variations';
import { IProductVariation } from '@/models/Product'; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface StockUpdateOptions {
  transactionId?: string;
  userId?: string;
  reason?: string;
  notes?: string;
  branchId?: string;
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
  /** Product already loaded by the caller (lean, incl. STOCK_SNAPSHOT_FIELDS) — skips a read. */
  product?: StockProductSnapshot;
  /** When provided, movements are pushed here instead of inserted; call insertStockMovements(). */
  movements?: StockMovementInput[];
}

export interface StockMovementInput {
  productId: string;
  tenantId: string;
  branchId?: string;
  variation?: { size?: string; color?: string; type?: string };
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  transactionId?: string;
  userId?: string;
  notes?: string;
}

/** Fields stock logic needs from a Product */
export const STOCK_SNAPSHOT_FIELDS =
  'trackInventory allowOutOfStockSales hasVariations stock variations branchStock';

export interface StockProductSnapshot {
  _id?: unknown;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
  hasVariations?: boolean;
  stock?: number;
  variations?: Array<{ _id?: unknown; size?: string; color?: string; type?: string; stock?: number }>;
  branchStock?: Array<{ branchId: { toString(): string }; stock: number }>;
}

type VariationOption = { size?: string; color?: string; type?: string };

/**
 * Current stock of an already-loaded product, considering branch and variation.
 * Pure — use this when the product is in hand instead of getProductStock().
 */
export function computeProductStock(
  product: StockProductSnapshot,
  options: { branchId?: string; variation?: VariationOption } = {}
): number {
  // If product doesn't track inventory, return a high number
  if (!product.trackInventory) {
    return 999999;
  }

  // If product has variations, check variation stock
  if (product.hasVariations && options.variation && product.variations) {
    const variation = product.variations.find((v) => matchesVariation(v, options.variation!));
    if (variation && variation.stock !== undefined) {
      // Variation stock is not tracked per branch
      return variation.stock;
    }
    return 0;
  }

  // If branch-specific stock is requested
  if (options.branchId && product.branchStock) {
    const branchStock = product.branchStock.find(
      (bs) => bs.branchId.toString() === options.branchId
    );
    if (branchStock) {
      return branchStock.stock;
    }
    return 0;
  }

  // Return master stock
  return product.stock || 0;
}

/**
 * Get current stock for a product, considering branch and variation
 */
export async function getProductStock(
  productId: string,
  tenantId: string,
  options: {
    branchId?: string;
    variation?: VariationOption;
  } = {}
): Promise<number> {
  await connectDB();

  const product = await Product.findOne({ _id: productId, tenantId })
    .select(STOCK_SNAPSHOT_FIELDS)
    .lean<StockProductSnapshot>();
  if (!product) {
    throw new Error('Product not found');
  }

  return computeProductStock(product, options);
}

/**
 * Update product stock and create stock movement record
 * Supports variations, branches, and bundles
 */
export async function updateStock(
  productId: string,
  tenantId: string,
  quantity: number,
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer',
  options: StockUpdateOptions = {},
  session?: mongoose.ClientSession
): Promise<void> {
  await connectDB();

  // The snapshot only decides *which* stock field to change (master / variation /
  // branch) — the change itself is an atomic conditional $inc, so a snapshot read
  // earlier in the request (e.g. checkout's product batch) is safe to reuse.
  let product = options.product;
  if (!product) {
    const query = Product.findOne({ _id: productId, tenantId })
      .select(STOCK_SNAPSHOT_FIELDS)
      .lean<StockProductSnapshot>();
    if (session) query.session(session);
    product = (await query) ?? undefined;
  }
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, skip stock update
  if (product.trackInventory === false) {
    logger.info(`Skipping stock update for product ${productId}: trackInventory is false`);
    return;
  }

  // Refuse to go negative unless the product allows out-of-stock sales
  // (same rule the Product pre-validate hook enforces on save)
  const stockGuard = quantity < 0 && product.allowOutOfStockSales !== true ? { $gte: -quantity } : undefined;

  let filter: Record<string, unknown>;
  let update: Record<string, unknown>;
  let readNewStock: (doc: StockProductSnapshot) => number;
  // True when the filter depends on the snapshot's shape (branch entry absent),
  // so a miss may mean "stale snapshot" rather than "insufficient stock"
  let usedSnapshotSensitiveFilter = false;
  let insufficientMessage: (available: number) => string;

  // Handle variations
  if (product.hasVariations && options.variation && product.variations) {
    const variation = product.variations.find((v) => matchesVariation(v, options.variation!));
    if (!variation) {
      throw new Error('Product variation not found');
    }
    const variationId = String(variation._id);
    filter = {
      _id: productId,
      tenantId,
      variations: { $elemMatch: { _id: variation._id, ...(stockGuard ? { stock: stockGuard } : {}) } },
    };
    update = { $inc: { 'variations.$.stock': quantity } };
    readNewStock = (doc) => doc.variations?.find((v) => String(v._id) === variationId)?.stock ?? 0;
    insufficientMessage = (available) =>
      `Insufficient stock for variation. Available: ${available}, Requested: ${Math.abs(quantity)}`;
  }
  // Handle branch-specific stock
  else if (options.branchId && product.branchStock) {
    const branchId = options.branchId;
    const hasBranchEntry = product.branchStock.some((bs) => bs.branchId.toString() === branchId);

    if (!hasBranchEntry) {
      // A new entry would start below zero — the pre-validate hook used to reject this on save
      if (stockGuard) {
        throw new Error(`Insufficient stock at branch. Available: 0, Requested: ${Math.abs(quantity)}`);
      }
      // Create new branch stock entry (filter fails if another request created it meanwhile)
      usedSnapshotSensitiveFilter = true;
      filter = { _id: productId, tenantId, 'branchStock.branchId': { $ne: branchId } };
      update = { $push: { branchStock: { branchId, stock: quantity } } };
    } else {
      filter = {
        _id: productId,
        tenantId,
        branchStock: { $elemMatch: { branchId, ...(stockGuard ? { stock: stockGuard } : {}) } },
      };
      update = { $inc: { 'branchStock.$.stock': quantity } };
    }
    readNewStock = (doc) => doc.branchStock?.find((bs) => bs.branchId.toString() === branchId)?.stock ?? 0;
    insufficientMessage = (available) =>
      `Insufficient stock at branch. Available: ${available}, Requested: ${Math.abs(quantity)}`;
  }
  // Handle master stock
  else {
    filter = { _id: productId, tenantId, ...(stockGuard ? { stock: stockGuard } : {}) };
    update = { $inc: { stock: quantity } };
    readNewStock = (doc) => doc.stock || 0;
    insufficientMessage = (available) =>
      `Insufficient stock. Available: ${available}, Requested: ${Math.abs(quantity)}`;
  }

  const updated = await Product.findOneAndUpdate(filter, update, {
    new: true,
    projection: { stock: 1, 'variations._id': 1, 'variations.stock': 1, branchStock: 1 },
    ...(session ? { session } : {}),
  }).lean<StockProductSnapshot>();

  if (!updated) {
    // The stock guard (or the branch-entry check) didn't match — re-read to explain why
    const freshQuery = Product.findOne({ _id: productId, tenantId })
      .select(STOCK_SNAPSHOT_FIELDS)
      .lean<StockProductSnapshot>();
    if (session) freshQuery.session(session);
    const fresh = await freshQuery;
    if (!fresh) {
      throw new Error('Product not found');
    }
    if (usedSnapshotSensitiveFilter) {
      // The branch entry was created meanwhile — retry once with the fresh product
      return updateStock(productId, tenantId, quantity, type, { ...options, product: fresh }, session);
    }
    throw new Error(insufficientMessage(computeProductStock(fresh, options)));
  }

  const newStock = readNewStock(updated);
  const previousStock = newStock - quantity;

  // Log the update for debugging
  logger.info(`Stock updated: Product ${productId}, ${previousStock} -> ${newStock} (${quantity > 0 ? '+' : ''}${quantity})`);

  // Create stock movement record
  const movementData: StockMovementInput = {
    productId,
    tenantId,
    branchId: options.branchId,
    variation: options.variation,
    type,
    quantity,
    previousStock,
    newStock,
    reason: options.reason,
    transactionId: options.transactionId,
    userId: options.userId,
    notes: options.notes,
  };
  if (options.movements) {
    // Caller batches the inserts (see insertStockMovements)
    options.movements.push(movementData);
  } else if (session) {
    await StockMovement.create([movementData], { session });
  } else {
    await StockMovement.create(movementData);
  }
}

/**
 * Insert stock movements collected via `options.movements` in a single write.
 */
export async function insertStockMovements(
  movements: StockMovementInput[],
  session?: mongoose.ClientSession
): Promise<void> {
  if (movements.length === 0) return;
  await StockMovement.insertMany(movements, session ? { session } : {});
}

/**
 * Update stock for a bundle (updates stock for all items in bundle)
 */
export async function updateBundleStock(
  bundleId: string,
  tenantId: string,
  quantity: number,
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer',
  options: StockUpdateOptions = {},
  session?: mongoose.ClientSession,
  /** Bundle and its products already loaded by the caller — skips the reads */
  preloaded?: {
    bundle?: {
      name: string;
      trackInventory?: boolean;
      items: Array<{ productId: { toString(): string }; quantity: number; variation?: VariationOption }>;
    };
    products?: Map<string, StockProductSnapshot>;
  }
): Promise<void> {
  await connectDB();

  let bundle = preloaded?.bundle;
  if (!bundle) {
    const bundleQuery = ProductBundle.findOne({ _id: bundleId, tenantId })
      .select('name trackInventory items')
      .lean();
    if (session) bundleQuery.session(session);
    bundle = (await bundleQuery) ?? undefined;
  }
  if (!bundle) {
    throw new Error('Bundle not found');
  }

  if (!bundle.trackInventory) {
    return;
  }

  // Update stock for each item in the bundle
  for (const item of bundle.items) {
    const itemQuantity = item.quantity * quantity; // Same sign as `quantity`: negative for a sale
    await updateStock(
      item.productId.toString(),
      tenantId,
      itemQuantity,
      type,
      {
        ...options,
        product: preloaded?.products?.get(item.productId.toString()),
        variation: item.variation,
        reason: options.reason || `Bundle ${type}: ${bundle.name}`,
        notes: options.notes || `Part of bundle: ${bundle.name}`,
      },
      session
    );
  }
}

/**
 * Get stock movements for a product
 */
export async function getStockMovements(
  productId: string,
  tenantId: string,
  options: {
    branchId?: string;
    variation?: {
      size?: string;
      color?: string;
      type?: string;
    };
    limit?: number;
  } = {}
) {
  await connectDB();

  const query: any = { productId, tenantId }; // eslint-disable-line @typescript-eslint/no-explicit-any
  
  if (options.branchId) {
    query.branchId = options.branchId;
  }

  if (options.variation) {
    const variationQuery: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (options.variation.size) variationQuery['variation.size'] = options.variation.size;
    if (options.variation.color) variationQuery['variation.color'] = options.variation.color;
    if (options.variation.type) variationQuery['variation.type'] = options.variation.type;
    Object.assign(query, variationQuery);
  }

  return StockMovement.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50)
    .populate('userId', 'name email')
    .populate('transactionId', 'receiptNumber total')
    .populate('branchId', 'name code')
    .lean();
}

/**
 * Check if product is low on stock
 */
export async function checkLowStock(
  productId: string,
  tenantId: string,
  threshold?: number
): Promise<boolean> {
  await connectDB();

  const product = await Product.findOne({ _id: productId, tenantId });
  if (!product) {
    return false;
  }

  if (!product.trackInventory) {
    return false;
  }

  const stockThreshold = threshold ?? (product.lowStockThreshold || 10);
  const currentStock = await getProductStock(productId, tenantId);

  return currentStock <= stockThreshold;
}

/**
 * Get all products with low stock.
 *
 * `threshold` overrides every product's own figure (an explicit ?threshold=).
 * Otherwise each product is judged by its own lowStockThreshold, and products
 * without one (unset or 0 — 0 means unset at product level) use
 * `fallbackThreshold`: the store's setting, where 0 means "only when out of
 * stock".
 */
export async function getLowStockProducts(
  tenantId: string,
  branchId?: string,
  threshold?: number,
  fallbackThreshold = 10
): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  await connectDB();

  const thresholdFor = (product: { lowStockThreshold?: number | null }) =>
    threshold ?? (product.lowStockThreshold || fallbackThreshold);

  // Pre-filter in the database so only candidates are read (this runs on an
  // inventory-page poll and in cron jobs). The filter is a superset of the exact
  // per-product check below, which still decides the final result.
  const thresholdExpr = threshold
    ?? { $cond: [{ $gt: [{ $ifNull: ['$lowStockThreshold', 0] }, 0] }, '$lowStockThreshold', fallbackThreshold] };
  const candidates: Record<string, unknown>[] = [
    // Variation products: checked per variation below
    { hasVariations: true },
    { $expr: { $lte: [{ $ifNull: ['$stock', 0] }, thresholdExpr] } },
  ];
  if (branchId) {
    candidates.push({ 'branchStock.branchId': branchId });
  }

  const products = await Product.find({
    tenantId,
    trackInventory: true,
    isActive: { $ne: false },
    $or: candidates,
  })
    .select('name sku price reorderQuantity stock lowStockThreshold hasVariations variations.stock branchStock')
    .lean();

  const lowStockProducts = [];

  for (const product of products) {
    const stockThreshold = thresholdFor(product);
    let isLowStock = false;
    let currentStock = 0;

    if (product.hasVariations && product.variations) {
      // Check each variation; report the lowest one that is at or under the line
      let lowest: number | null = null;
      for (const variation of product.variations) {
        const stock = variation.stock || 0;
        if (stock <= stockThreshold) {
          isLowStock = true;
          lowest = lowest === null ? stock : Math.min(lowest, stock);
        }
      }
      currentStock = lowest ?? 0;
    } else if (branchId && product.branchStock) {
      const branchStock = product.branchStock.find(
        (bs) => bs.branchId.toString() === branchId
      );
      if (branchStock) {
        currentStock = branchStock.stock;
        isLowStock = currentStock <= stockThreshold;
      }
    } else {
      currentStock = product.stock || 0;
      isLowStock = currentStock <= stockThreshold;
    }

    if (isLowStock) {
      lowStockProducts.push({
        ...product,
        currentStock,
        threshold: stockThreshold,
      });
    }
  }

  return lowStockProducts;
}
