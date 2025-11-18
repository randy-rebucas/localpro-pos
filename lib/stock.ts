import connectDB from './mongodb';
import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';

/**
 * Update product stock and create stock movement record
 */
export async function updateStock(
  productId: string,
  tenantId: string,
  quantity: number,
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer',
  options: {
    transactionId?: string;
    userId?: string;
    reason?: string;
    notes?: string;
  } = {}
): Promise<void> {
  await connectDB();

  const product = await Product.findOne({ _id: productId, tenantId });
  if (!product) {
    throw new Error('Product not found');
  }

  const previousStock = product.stock;
  const newStock = previousStock + quantity;

  if (newStock < 0) {
    throw new Error(`Insufficient stock. Available: ${previousStock}, Requested: ${Math.abs(quantity)}`);
  }

  // Update product stock
  product.stock = newStock;
  await product.save();

  // Create stock movement record
  await StockMovement.create({
    productId,
    tenantId,
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
 * Get stock movements for a product
 */
export async function getStockMovements(
  productId: string,
  tenantId: string,
  limit: number = 50
) {
  await connectDB();

  return StockMovement.find({ productId, tenantId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email')
    .populate('transactionId', 'receiptNumber total')
    .lean();
}

