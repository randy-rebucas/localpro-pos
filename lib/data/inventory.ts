import prisma from '@/lib/prisma';
import { serializeProduct } from '@/lib/data/products';

interface VariationLike {
  size?: string;
  color?: string;
  type?: string;
  stock?: number;
  [key: string]: unknown;
}

/**
 * A separate implementation from lib/stock.ts's getLowStockProducts.
 * Branch-specific stock lives in the ProductBranchStock child table.
 */
export async function getLowStockProducts(tenantId: string, branchId?: string, threshold?: number) {
  const products = await prisma.product.findMany({
    where: { tenantId, trackInventory: true },
    include: branchId ? { branchStock: { where: { branchId } } } : undefined,
  });

  const lowStockProducts: Array<Record<string, unknown>> = [];

  for (const product of products) {
    let isLowStock = false;
    let currentStock = 0;
    const stockThreshold = threshold || product.lowStockThreshold || 10;

    if (product.hasVariations && product.variations) {
      const variations = product.variations as VariationLike[];
      for (const variation of variations) {
        const stock = variation.stock || 0;
        if (stock <= stockThreshold) {
          isLowStock = true;
          currentStock = currentStock ? Math.min(currentStock, stock) : stock;
        }
      }
    } else if (branchId && 'branchStock' in product) {
      const branchStockRow = (product as unknown as { branchStock: Array<{ stock: number }> }).branchStock[0];
      if (branchStockRow) {
        currentStock = branchStockRow.stock;
        isLowStock = currentStock <= stockThreshold;
      }
    } else {
      currentStock = Number(product.stock) || 0;
      isLowStock = currentStock <= stockThreshold;
    }

    if (isLowStock) {
      const { branchStock, ...rest } = product as unknown as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
      lowStockProducts.push({
        ...serializeProduct(product as any), // eslint-disable-line @typescript-eslint/no-explicit-any
        currentStock,
        threshold: stockThreshold,
      });
    }
  }

  return lowStockProducts;
}
