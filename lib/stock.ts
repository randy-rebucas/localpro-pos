import prisma from '@/lib/prisma';
import type { PrismaTx } from '@/lib/db-transaction';
import { logger } from '@/lib/logger';

type Db = PrismaTx | typeof prisma;

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
}

interface ProductVariation {
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

function findVariationIndex(
  variations: ProductVariation[],
  wanted: { size?: string; color?: string; type?: string }
): number {
  return variations.findIndex((v) => {
    const matchSize = !wanted.size || v.size === wanted.size;
    const matchColor = !wanted.color || v.color === wanted.color;
    const matchType = !wanted.type || v.type === wanted.type;
    return matchSize && matchColor && matchType;
  });
}

/**
 * Get current stock for a product, considering branch and variation
 */
export async function getProductStock(
  productId: string,
  tenantId: string,
  options: {
    branchId?: string;
    variation?: { size?: string; color?: string; type?: string };
  } = {},
  db: Db = prisma
): Promise<number> {
  const product = await db.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, return a high number
  if (!product.trackInventory) {
    return 999999;
  }

  // If product has variations, check variation stock
  if (product.hasVariations && options.variation && product.variations) {
    const variations = (product.variations as unknown as ProductVariation[]) || [];
    const index = findVariationIndex(variations, options.variation);
    if (index !== -1 && variations[index].stock !== undefined) {
      return variations[index].stock as number;
    }
    return 0;
  }

  // If branch-specific stock is requested
  if (options.branchId) {
    const branchStock = await db.productBranchStock.findUnique({
      where: { productId_branchId: { productId, branchId: options.branchId } },
    });
    return branchStock?.stock ?? 0;
  }

  // Return master stock
  return Number(product.stock ?? 0);
}

/**
 * Update product stock and create stock movement record.
 * Supports variations, branches, and bundles. Pass `db` (a Prisma transaction
 * client from lib/db-transaction.ts's runInTransaction) to make this part of
 * a larger atomic write; otherwise it runs against the default client.
 */
export async function updateStock(
  productId: string,
  tenantId: string,
  quantity: number,
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer',
  options: StockUpdateOptions = {},
  db: Db = prisma
): Promise<void> {
  const product = await db.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, skip stock update
  if (product.trackInventory === false) {
    logger.info(`Skipping stock update for product ${productId}: trackInventory is false`);
    return;
  }

  let previousStock: number;
  let newStock: number;

  // Handle variations
  if (product.hasVariations && options.variation && product.variations) {
    const variations = [...((product.variations as unknown as ProductVariation[]) || [])];
    const index = findVariationIndex(variations, options.variation);

    if (index === -1) {
      throw new Error('Product variation not found');
    }

    previousStock = variations[index].stock || 0;
    newStock = previousStock + quantity;

    if (newStock < 0 && !product.allowOutOfStockSales) {
      throw new Error(
        `Insufficient stock for variation. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    variations[index] = { ...variations[index], stock: newStock };
    await db.product.update({ where: { id: productId }, data: { variations: variations as never } });
  }
  // Handle branch-specific stock
  else if (options.branchId) {
    const existing = await db.productBranchStock.findUnique({
      where: { productId_branchId: { productId, branchId: options.branchId } },
    });

    if (!existing) {
      previousStock = 0;
      newStock = quantity;
      await db.productBranchStock.create({
        data: { productId, branchId: options.branchId, stock: newStock },
      });
    } else {
      previousStock = existing.stock;
      newStock = previousStock + quantity;

      if (newStock < 0 && !product.allowOutOfStockSales) {
        throw new Error(
          `Insufficient stock at branch. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
        );
      }

      await db.productBranchStock.update({ where: { id: existing.id }, data: { stock: newStock } });
    }
  }
  // Handle master stock
  else {
    previousStock = Number(product.stock ?? 0);
    newStock = previousStock + quantity;

    if (newStock < 0 && !product.allowOutOfStockSales) {
      throw new Error(
        `Insufficient stock. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    await db.product.update({ where: { id: productId }, data: { stock: BigInt(newStock) } });
  }

  logger.info(`Stock updated: Product ${productId}, ${previousStock} -> ${newStock} (${quantity > 0 ? '+' : ''}${quantity})`);

  await db.stockMovement.create({
    data: {
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
    },
  });
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
  db: Db = prisma
): Promise<void> {
  const bundle = await db.productBundle.findFirst({
    where: { id: bundleId, tenantId },
    include: { items: true },
  });
  if (!bundle) {
    throw new Error('Bundle not found');
  }

  if (!bundle.trackInventory) {
    return;
  }

  for (const item of bundle.items) {
    const itemQuantity = item.quantity * quantity; // Multiply by bundle quantity
    await updateStock(
      item.productId,
      tenantId,
      -itemQuantity, // Negative for sale, positive for purchase
      type,
      {
        ...options,
        variation: (item.variation as { size?: string; color?: string; type?: string } | null) ?? undefined,
        reason: options.reason || `Bundle ${type}: ${bundle.name}`,
        notes: options.notes || `Part of bundle: ${bundle.name}`,
      },
      db
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
    variation?: { size?: string; color?: string; type?: string };
    limit?: number;
  } = {}
) {
  const where: Record<string, unknown> = { productId, tenantId };
  if (options.branchId) where.branchId = options.branchId;
  // Variation is stored as a jsonb column — filter in application code below
  // rather than a jsonb-path query, since the shape is small and this is
  // simple enough for the callers that use it.

  const movements = await prisma.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit || 50,
    include: {
      user: { select: { name: true, email: true } },
      transaction: { select: { receiptNumber: true, total: true } },
      branch: { select: { name: true, code: true } },
    },
  });

  if (!options.variation) return movements;

  return movements.filter((m) => {
    const v = m.variation as { size?: string; color?: string; type?: string } | null;
    if (!v) return false;
    if (options.variation?.size && v.size !== options.variation.size) return false;
    if (options.variation?.color && v.color !== options.variation.color) return false;
    if (options.variation?.type && v.type !== options.variation.type) return false;
    return true;
  });
}

/**
 * Check if product is low on stock
 */
export async function checkLowStock(
  productId: string,
  tenantId: string,
  threshold?: number
): Promise<boolean> {
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
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
  const products = await prisma.product.findMany({
    where: { tenantId, trackInventory: true },
    include: branchId ? { branchStock: { where: { branchId } } } : undefined,
  });

  const lowStockProducts = [];

  for (const product of products) {
    let isLowStock = false;
    let currentStock = 0;

    if (product.hasVariations && product.variations) {
      const variations = (product.variations as unknown as ProductVariation[]) || [];
      for (const variation of variations) {
        const stock = variation.stock || 0;
        const stockThreshold = threshold || product.lowStockThreshold || 10;
        if (stock <= stockThreshold) {
          isLowStock = true;
          currentStock = Math.min(currentStock || stock, stock);
        }
      }
    } else if (branchId && 'branchStock' in product) {
      const branchStock = (product as unknown as { branchStock: { stock: number }[] }).branchStock[0];
      if (branchStock) {
        currentStock = branchStock.stock;
        const stockThreshold = threshold || product.lowStockThreshold || 10;
        isLowStock = currentStock <= stockThreshold;
      }
    } else {
      currentStock = Number(product.stock ?? 0);
      const stockThreshold = threshold || product.lowStockThreshold || 10;
      isLowStock = currentStock <= stockThreshold;
    }

    if (isLowStock) {
      lowStockProducts.push({
        ...product,
        stock: Number(product.stock ?? 0),
        currentStock,
        threshold: threshold || product.lowStockThreshold || 10,
      });
    }
  }

  return lowStockProducts;
}
