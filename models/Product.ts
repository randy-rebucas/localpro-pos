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
  stock: number; // Master stock (used when no branches/variations)
  sku?: string;
  category?: string;
  categoryId?: mongoose.Types.ObjectId;
  image?: string;
  // New fields for inventory management
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: IProductVariation[];
  branchStock?: IBranchStock[]; // Branch-specific stock levels
  trackInventory: boolean; // Whether to track inventory for this product
  allowOutOfStockSales?: boolean; // Whether to allow sales when out of stock
  lowStockThreshold?: number; // Product-specific threshold (overrides tenant default)
  pinned?: boolean; // Whether the product is pinned to the top
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
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
    stock: {
      type: Number,
      required: [true, 'Stock quantity is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    sku: {
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
      index: true,
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
        min: 0,
        default: 0,
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
        min: 0,
        default: 0,
      },
    }],
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
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tenant-scoped unique SKU
ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });
// Index for product type and inventory tracking
ProductSchema.index({ tenantId: 1, productType: 1, trackInventory: 1 });
ProductSchema.index({ tenantId: 1, hasVariations: 1 });

const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;

