import connectDB from './mongodb';
import Product from '@/models/Product';
import ProductBundle from '@/models/ProductBundle';
import StockMovement from '@/models/StockMovement';

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
  await connectDB();

  const product = await Product.findOne({ _id: productId, tenantId });
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, return a high number
  if (!product.trackInventory) {
    return 999999;
  }

  // If product has variations, check variation stock
  if (product.hasVariations && options.variation && product.variations) {
    const variationOption = options.variation;
    const variation = product.variations.find((v) => {
      const matchSize = !variationOption.size || v.size === variationOption.size;
      const matchColor = !variationOption.color || v.color === variationOption.color;
      const matchType = !variationOption.type || v.type === variationOption.type;
      return matchSize && matchColor && matchType;
    });

    if (variation && variation.stock !== undefined) {
      // If branch-specific stock is requested
      if (options.branchId && product.branchStock) {
        // For variations with branches, we'd need to extend the model
        // For now, return variation stock
        return variation.stock;
      }
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
 * Update product stock and create stock movement record
 * Supports variations, branches, and bundles
 */
export async function updateStock(
  productId: string,
  tenantId: string,
  quantity: number,
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer',
  options: StockUpdateOptions = {}
): Promise<void> {
  await connectDB();

  const product = await Product.findOne({ _id: productId, tenantId });
  if (!product) {
    throw new Error('Product not found');
  }

  // If product doesn't track inventory, skip stock update
  if (product.trackInventory === false) {
    console.log(`Skipping stock update for product ${productId}: trackInventory is false`);
    return;
  }

  let previousStock: number;
  let newStock: number;

  // Handle variations
  if (product.hasVariations && options.variation && product.variations) {
    const variationIndex = product.variations.findIndex((v) => {
      const matchSize = !options.variation?.size || v.size === options.variation.size;
      const matchColor = !options.variation?.color || v.color === options.variation.color;
      const matchType = !options.variation?.type || v.type === options.variation.type;
      return matchSize && matchColor && matchType;
    });

    if (variationIndex === -1) {
      throw new Error('Product variation not found');
    }

    previousStock = product.variations[variationIndex].stock || 0;
    newStock = previousStock + quantity;

    // Only check for negative stock if product doesn't allow out-of-stock sales
    if (newStock < 0 && !product.allowOutOfStockSales) {
      throw new Error(
        `Insufficient stock for variation. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
      );
    }

    product.variations[variationIndex].stock = newStock;
  }
  // Handle branch-specific stock
  else if (options.branchId && product.branchStock) {
    const branchStockIndex = product.branchStock.findIndex(
      (bs) => bs.branchId.toString() === options.branchId
    );

    if (branchStockIndex === -1) {
      // Create new branch stock entry
      product.branchStock.push({
        branchId: options.branchId as mongoose.Types.ObjectId,
        stock: quantity,
      });
      previousStock = 0;
      newStock = quantity;
    } else {
      previousStock = product.branchStock[branchStockIndex].stock;
      newStock = previousStock + quantity;

      // Only check for negative stock if product doesn't allow out-of-stock sales
      if (newStock < 0 && !product.allowOutOfStockSales) {
        throw new Error(
          `Insufficient stock at branch. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`
        );
      }

      product.branchStock[branchStockIndex].stock = newStock;
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

    product.stock = newStock;
  }

  // Mark nested arrays as modified if needed
  if (product.isModified('variations')) {
    product.markModified('variations');
  }
  if (product.isModified('branchStock')) {
    product.markModified('branchStock');
  }

  await product.save();
  
  // Log the update for debugging
  console.log(`Stock updated: Product ${productId}, ${previousStock} -> ${newStock} (${quantity > 0 ? '+' : ''}${quantity})`);

  // Create stock movement record
  await StockMovement.create({
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
  options: StockUpdateOptions = {}
): Promise<void> {
  await connectDB();

  const bundle = await ProductBundle.findOne({ _id: bundleId, tenantId });
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
        variation: item.variation,
        reason: options.reason || `Bundle ${type}: ${bundle.name}`,
        notes: options.notes || `Part of bundle: ${bundle.name}`,
      }
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

  const query: Record<string, unknown> = { productId, tenantId };
  
  if (options.branchId) {
    query.branchId = options.branchId;
  }

  if (options.variation) {
    const variationQuery: Record<string, unknown> = {};
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
): Promise<Array<{ _id: string; name: string; currentStock: number; threshold: number; sku?: string }>> {
  await connectDB();

  const products = await Product.find({
    tenantId,
    trackInventory: true,
  }).lean();

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
