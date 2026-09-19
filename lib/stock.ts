import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
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
}

/** Prisma client or an in-flight `prisma.$transaction` callback client. */
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

function resolveClient(tx: PrismaClientOrTx | undefined): PrismaClientOrTx {
  return tx ?? prisma;
}

function matchesVariation(
  v: { size: string | null; color: string | null; type: string | null },
  variation?: { size?: string; color?: string; type?: string }
): boolean {
  const matchSize = !variation?.size || v.size === variation.size;
  const matchColor = !variation?.color || v.color === variation.color;
  const matchType = !variation?.type || v.type === variation.type;
  return matchSize && matchColor && matchType;
}

/**
 * Get current stock for a product, considering branch and variation
 */
export async function getProductStock(
  productId: string,
  tenantId: string,
  options: {
    branchId?: string;
    variation?: {
      size?: string;
      color?: string;
      type?: string;
    };
  } = {}
): Promise<number> {
  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    include: { variations: true, branchStock: true },
  });
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, return a high number
  if (!product.trackInventory) {
    return 999999;
  }

  // If product has variations, check variation stock
  if (product.hasVariations && options.variation && product.variations.length > 0) {
    const variation = product.variations.find((v) => matchesVariation(v, options.variation));

    if (variation && variation.stock !== undefined) {
      // If branch-specific stock is requested
      if (options.branchId && product.branchStock.length > 0) {
        // For variations with branches, we'd need to extend the model
        // For now, return variation stock
        return variation.stock;
      }
      return variation.stock;
    }
    return 0;
  }

  // If branch-specific stock is requested
  if (options.branchId && product.branchStock.length > 0) {
    const branchStock = product.branchStock.find((bs) => bs.branchId === options.branchId);
    if (branchStock) {
      return branchStock.stock;
    }
    return 0;
  }

  // Return master stock
  return product.stock || 0;
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
  tx?: PrismaClientOrTx
): Promise<void> {
  const client = resolveClient(tx);

  const product = await client.product.findFirst({
    where: { id: productId, tenantId },
    include: { variations: true, branchStock: true },
  });
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
  if (product.hasVariations && options.variation && product.variations.length > 0) {
    const variation = product.variations.find((v) => matchesVariation(v, options.variation));

    if (!variation) {
      throw new Error('Product variation not found');
    }

    previousStock = variation.stock || 0;
    newStock = previousStock + quantity;

    // Only check for negative stock if product doesn't allow out-of-stock sales
    if (newStock < 0 && !product.allowOutOfStockSales) {
      throw new Error(
        `Insufficient stock for variation. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    await client.productVariation.update({
      where: { id: variation.id },
      data: { stock: newStock },
    });
  }
  // Handle branch-specific stock
  else if (options.branchId && product.branchStock) {
    const branchStock = product.branchStock.find((bs) => bs.branchId === options.branchId);

    if (!branchStock) {
      // Create new branch stock entry
      previousStock = 0;
      newStock = quantity;
      await client.productBranchStock.create({
        data: {
          id: randomUUID(),
          productId,
          branchId: options.branchId,
          stock: newStock,
        },
      });
    } else {
      previousStock = branchStock.stock;
      newStock = previousStock + quantity;

      // Only check for negative stock if product doesn't allow out-of-stock sales
      if (newStock < 0 && !product.allowOutOfStockSales) {
        throw new Error(
          `Insufficient stock at branch. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
        );
      }

      await client.productBranchStock.update({
        where: { id: branchStock.id },
        data: { stock: newStock },
      });
    }
  }
  // Handle master stock
  else {
    previousStock = product.stock || 0;
    newStock = previousStock + quantity;

    // Only check for negative stock if product doesn't allow out-of-stock sales
    if (newStock < 0 && !product.allowOutOfStockSales) {
      throw new Error(
        `Insufficient stock. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    await client.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });
  }

  // Log the update for debugging
  logger.info(`Stock updated: Product ${productId}, ${previousStock} -> ${newStock} (${quantity > 0 ? '+' : ''}${quantity})`);

  // Create stock movement record
  await client.stockMovement.create({
    data: {
      id: randomUUID(),
      productId,
      tenantId,
      branchId: options.branchId,
      variationSize: options.variation?.size,
      variationColor: options.variation?.color,
      variationType: options.variation?.type,
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
  tx?: PrismaClientOrTx
): Promise<void> {
  const client = resolveClient(tx);

  const bundle = await client.productBundle.findFirst({
    where: { id: bundleId, tenantId },
    include: { items: true },
  });
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
      item.productId,
      tenantId,
      -itemQuantity, // Negative for sale, positive for purchase
      type,
      {
        ...options,
        variation:
          item.variationSize || item.variationColor || item.variationType
            ? {
                size: item.variationSize ?? undefined,
                color: item.variationColor ?? undefined,
                type: item.variationType ?? undefined,
              }
            : undefined,
        reason: options.reason || `Bundle ${type}: ${bundle.name}`,
        notes: options.notes || `Part of bundle: ${bundle.name}`,
      },
      client
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
  const where: Prisma.StockMovementWhereInput = { productId, tenantId };

  if (options.branchId) {
    where.branchId = options.branchId;
  }

  if (options.variation) {
    if (options.variation.size) where.variationSize = options.variation.size;
    if (options.variation.color) where.variationColor = options.variation.color;
    if (options.variation.type) where.variationType = options.variation.type;
  }

  return prisma.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit || 50,
    include: {
      user: { select: { name: true, email: true } },
      transaction: { select: { receiptNumber: true, total: true } },
      branch: { select: { name: true, code: true } },
    },
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
    where: {
      tenantId,
      trackInventory: true,
      isActive: { not: false },
    },
    include: { variations: true, branchStock: true },
  });

  const lowStockProducts = [];

  for (const product of products) {
    let isLowStock = false;
    let currentStock = 0;

    if (product.hasVariations && product.variations.length > 0) {
      // Check each variation
      for (const variation of product.variations) {
        const stock = variation.stock || 0;
        const stockThreshold = threshold || product.lowStockThreshold || 10;
        if (stock <= stockThreshold) {
          isLowStock = true;
          currentStock = Math.min(currentStock || stock, stock);
        }
      }
    } else if (branchId && product.branchStock.length > 0) {
      const branchStock = product.branchStock.find((bs) => bs.branchId === branchId);
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
        _id: product.id,
        currentStock,
        threshold: threshold || product.lowStockThreshold || 10,
      });
    }
  }

  return lowStockProducts;
}
