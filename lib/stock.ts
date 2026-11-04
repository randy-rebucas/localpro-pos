import { getRepos, type DbTx, type ProductStock, type StockMovementInput, type StockTarget } from '@/lib/db';
import { logger } from '@/lib/logger';

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

export type { StockMovementInput };

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

function matchesVariation(v: VariationOption, option: VariationOption): boolean {
  const matchSize = !option.size || v.size === option.size;
  const matchColor = !option.color || v.color === option.color;
  const matchType = !option.type || v.type === option.type;
  return matchSize && matchColor && matchType;
}

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
  const product = await getRepos().products.findById(tenantId, productId, { select: STOCK_SNAPSHOT_FIELDS });
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
  tx?: DbTx
): Promise<void> {
  const { products } = getRepos();

  // The snapshot only decides *which* stock field to change (master / variation /
  // branch) — the change itself is an atomic conditional increment, so a snapshot
  // read earlier in the request (e.g. checkout's product batch) is safe to reuse.
  let product = options.product;
  if (!product) {
    product = (await products.findById(tenantId, productId, { select: STOCK_SNAPSHOT_FIELDS, tx })) ?? undefined;
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
  const allowNegative = product.allowOutOfStockSales === true;
  const stockGuard = quantity < 0 && !allowNegative;

  let target: StockTarget;
  let readNewStock: (doc: ProductStock) => number;
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
    target = { kind: 'variation', variationId };
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
      // Create new branch stock entry (fails if another request created it meanwhile)
      usedSnapshotSensitiveFilter = true;
      target = { kind: 'newBranch', branchId };
    } else {
      target = { kind: 'branch', branchId };
    }
    readNewStock = (doc) => doc.branchStock?.find((bs) => bs.branchId.toString() === branchId)?.stock ?? 0;
    insufficientMessage = (available) =>
      `Insufficient stock at branch. Available: ${available}, Requested: ${Math.abs(quantity)}`;
  }
  // Handle master stock
  else {
    target = { kind: 'master' };
    readNewStock = (doc) => doc.stock || 0;
    insufficientMessage = (available) =>
      `Insufficient stock. Available: ${available}, Requested: ${Math.abs(quantity)}`;
  }

  const updated = await products.adjustStock(tenantId, productId, target, quantity, { allowNegative, tx });

  if (!updated) {
    // The stock guard (or the branch-entry check) didn't match — re-read to explain why
    const fresh = await products.findById(tenantId, productId, { select: STOCK_SNAPSHOT_FIELDS, tx });
    if (!fresh) {
      throw new Error('Product not found');
    }
    if (usedSnapshotSensitiveFilter) {
      // The branch entry was created meanwhile — retry once with the fresh product
      return updateStock(productId, tenantId, quantity, type, { ...options, product: fresh }, tx);
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
  } else {
    await getRepos().stockMovements.createMany([movementData], { tx });
  }
}

/**
 * Insert stock movements collected via `options.movements` in a single write.
 */
export async function insertStockMovements(movements: StockMovementInput[], tx?: DbTx): Promise<void> {
  await getRepos().stockMovements.createMany(movements, { tx });
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
  tx?: DbTx,
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
  let bundle = preloaded?.bundle;
  if (!bundle) {
    bundle =
      ((await getRepos().bundles.findById(tenantId, bundleId, { select: 'name trackInventory items', tx })) as NonNullable<typeof preloaded>['bundle']) ?? undefined;
  }
  if (!bundle) {
    throw new Error('Bundle not found');
  }

  if (!bundle.trackInventory) {
    return;
  }

  // Update stock for each item in the bundle
  for (const item of bundle.items) {
    const itemQuantity = item.quantity * quantity; // Multiply by bundle quantity
    await updateStock(
      item.productId.toString(),
      tenantId,
      -itemQuantity, // Negative for sale, positive for purchase
      type,
      {
        ...options,
        product: preloaded?.products?.get(item.productId.toString()),
        variation: item.variation,
        reason: options.reason || `Bundle ${type}: ${bundle.name}`,
        notes: options.notes || `Part of bundle: ${bundle.name}`,
      },
      tx
    );
  }
}

/**
 * Check if product is low on stock
 */
export async function checkLowStock(
  productId: string,
  tenantId: string,
  threshold?: number
): Promise<boolean> {
  const product = await getRepos().products.findById(tenantId, productId);
  if (!product) {
    return false;
  }

  if (!product.trackInventory) {
    return false;
  }

  const stockThreshold = threshold || product.lowStockThreshold || 10;
  const currentStock = await getProductStock(productId, tenantId);

  return currentStock <= stockThreshold;
}

/**
 * Get all products with low stock
 */
export async function getLowStockProducts(
  tenantId: string,
  branchId?: string,
  threshold?: number
): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  // Pre-filter in the database so only candidates are read (this runs on an
  // inventory-page poll and in cron jobs). The filter is a superset of the exact
  // per-product check below, which still decides the final result.
  const products = await getRepos().products.listLowStockCandidates(tenantId, {
    branchId,
    threshold,
    select: 'name sku price reorderQuantity stock lowStockThreshold hasVariations variations.stock branchStock',
  });

  const lowStockProducts = [];

  for (const product of products) {
    let isLowStock = false;
    let currentStock = 0;

    if (product.hasVariations && product.variations) {
      // Check each variation
      for (const variation of product.variations) {
        const stock = variation.stock || 0;
        const stockThreshold = threshold || product.lowStockThreshold || 10;
        if (stock <= stockThreshold) {
          isLowStock = true;
          currentStock = Math.min(currentStock || stock, stock);
        }
      }
    } else if (branchId && product.branchStock) {
      const branchStock = product.branchStock.find(
        (bs) => bs.branchId.toString() === branchId
      );
      if (branchStock) {
        currentStock = branchStock.stock;
        const stockThreshold = threshold || product.lowStockThreshold || 10;
        isLowStock = currentStock <= stockThreshold;
      }
    } else {
      currentStock = product.stock || 0;
      const stockThreshold = threshold || product.lowStockThreshold || 10;
      isLowStock = currentStock <= stockThreshold;
    }

    if (isLowStock) {
      lowStockProducts.push({
        ...product,
        currentStock,
        threshold: threshold || product.lowStockThreshold || 10,
      });
    }
  }

  return lowStockProducts;
}
