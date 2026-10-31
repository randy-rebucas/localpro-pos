import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProductVariation {
  size?: string;
  color?: string;
  type?: string;
  sku?: string;
  price?: number; // Override base price if needed
  stock?: number; // Variation-specific stock
}

export interface IBranchStock {
  branchId: mongoose.Types.ObjectId;
  stock: number;
}

export interface IProduct extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  basePrice?: number; // Original price before dynamic pricing adjustments
  stock: number; // Master stock (used when no branches/variations)
  sku?: string;
  barcode?: string;
  category?: string;
  categoryId?: mongoose.Types.ObjectId;
  image?: string;
  // New fields for inventory management
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: IProductVariation[];
  branchStock?: IBranchStock[]; // Branch-specific stock levels
  taxExempt: boolean; // Whether the product is VAT/tax exempt
  zeroRated?: boolean; // BIR zero-rated sales (e.g. export sales, PEZA-registered buyers) — 0% VAT, distinct from tax-exempt
  trackInventory: boolean; // Whether to track inventory for this product
  allowOutOfStockSales?: boolean; // Whether to allow sales when out of stock
  lowStockThreshold?: number; // Product-specific threshold (overrides tenant default)
  lowStockAlertedAt?: Date; // Last low-stock alert that included this product (dedupes the hourly job)
  pinned?: boolean; // Whether the product is pinned to the top

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price must be positive'],
    },
    // Original price before dynamic pricing adjustments (set on first adjustment)
    basePrice: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      default: 0,
      // Validation moved to pre-save hook to properly check allowOutOfStockSales
    },
    sku: {
      type: String,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },
    image: {
      type: String,
    },
    // New fields for inventory management
    productType: {
      type: String,
      enum: ['regular', 'bundle', 'service'],
      default: 'regular',
    },
    hasVariations: {
      type: Boolean,
      default: false,
    },
    variations: [{
      size: String,
      color: String,
      type: String,
      sku: String,
      price: {
        type: Number,
        min: 0,
      },
      stock: {
        type: Number,
        default: 0,
        // Note: Variation stock validation is handled in the parent document context
      },
    }],
    branchStock: [{
      branchId: {
        type: Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
      },
      stock: {
        type: Number,
        required: true,
        default: 0,
        // Note: Branch stock validation is handled in the parent document context
      },
    }],
    taxExempt: {
      type: Boolean,
      default: false,
    },
    zeroRated: {
      type: Boolean,
      default: false,
    },
    trackInventory: {
      type: Boolean,
      default: true,
    },
    allowOutOfStockSales: {
      type: Boolean,
      default: false,
    },
    lowStockThreshold: {
      type: Number,
      min: 0,
    },
    // Last low-stock alert that included this product (dedupes the hourly alert job)
    lowStockAlertedAt: {
      type: Date,
    },
    pinned: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to validate stock values based on allowOutOfStockSales
// This hook runs before Mongoose validators, allowing us to bypass schema-level validations
ProductSchema.pre('validate', function(next) {
  const product = this as unknown as IProduct;
  const allowNegative = product.allowOutOfStockSales === true;

  // Skip stock validation entirely if allowOutOfStockSales is true
  if (allowNegative) {
    return next();
  }

  // Validate master stock
  if (typeof product.stock === 'number' && product.stock < 0) {
    return next(new Error('Stock cannot be negative unless allowOutOfStockSales is enabled'));
  }

  // Validate variation stock
  if (product.variations && Array.isArray(product.variations)) {
    for (const variation of product.variations) {
      if (variation.stock !== undefined && typeof variation.stock === 'number' && variation.stock < 0) {
        return next(new Error(`Variation stock cannot be negative unless allowOutOfStockSales is enabled`));
      }
    }
  }

  // Validate branch stock
  if (product.branchStock && Array.isArray(product.branchStock)) {
    for (const branchStock of product.branchStock) {
      if (typeof branchStock.stock === 'number' && branchStock.stock < 0) {
        return next(new Error(`Branch stock cannot be negative unless allowOutOfStockSales is enabled`));
      }
    }
  }

  next();
});

// Cascade delete protection: prevent deletion if product is referenced in transactions or saved carts
async function checkProductDependencies(filter: Record<string, unknown>) {
  const doc = await mongoose.model('Product').findOne(filter);
  if (!doc) return;

  const Transaction = mongoose.model('Transaction');
  // Tenant-scoped existence checks (stop at the first match) instead of
  // counting across every tenant's transactions.
  const referencedByTransaction = await Transaction.exists({
    tenantId: doc.tenantId,
    status: 'completed',
    'items.product': doc._id,
  });
  if (referencedByTransaction) {
    throw new Error(
      `Cannot delete product "${doc.name}": completed transactions reference this product. Consider deactivating it instead.`
    );
  }

  const SavedCart = mongoose.model('SavedCart');
  const referencedBySavedCart = await SavedCart.exists({
    tenantId: doc.tenantId,
    'items.productId': doc._id,
  });
  if (referencedBySavedCart) {
    throw new Error(
      `Cannot delete product "${doc.name}": saved carts reference this product. Remove the product from saved carts first.`
    );
  }
}

ProductSchema.pre('findOneAndDelete', async function (next) {
  try {
    await checkProductDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

ProductSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  try {
    await checkProductDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

/** Case-insensitive (strength 2) collation shared by the {tenantId, name} index and its queries. */
export const PRODUCT_NAME_COLLATION = { locale: 'en', strength: 2 } as const;

// Compound index for tenant-scoped unique SKU
// Partial, not sparse (see barcode note below). `$gt: ''` alone implies a non-empty
// string, and equality lookups like { tenantId, sku: 'ABC' } satisfy it, so the
// planner can still use this index for SKU lookups.
ProductSchema.index(
  { tenantId: 1, sku: 1 },
  { unique: true, partialFilterExpression: { sku: { $gt: '' } } }
);
// Compound index for tenant-scoped unique barcode. Partial, not sparse: a sparse
// compound index still indexes docs missing barcode (tenantId is present), so
// every barcode-less product in a tenant would collide on {tenantId, null}.
ProductSchema.index(
  { tenantId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string', $gt: '' } } }
);
// Index for product type and inventory tracking
ProductSchema.index({ tenantId: 1, productType: 1, trackInventory: 1 });
ProductSchema.index({ tenantId: 1, hasVariations: 1 });
// Compound index for POS pinned product queries (pinned first, then newest)
ProductSchema.index({ tenantId: 1, pinned: -1, createdAt: -1 });
// Category-filtered product list (same sort as the pinned index above)
ProductSchema.index({ tenantId: 1, categoryId: 1, pinned: -1, createdAt: -1 });
// Inventory-tracked product scans (low-stock alerts, stock automations)
ProductSchema.index({ tenantId: 1, trackInventory: 1 });
// Case-insensitive exact name lookups (duplicate-name check on create). Queries must pass
// the same collation (PRODUCT_NAME_COLLATION) or the planner won't use this index.
// Non-unique: duplicate names are allowed after the user confirms.
ProductSchema.index({ tenantId: 1, name: 1 }, { collation: PRODUCT_NAME_COLLATION });

const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;

