import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBundleItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  quantity: number;
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
}

export interface IProductBundle extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  price: number; // Bundle price (may be different from sum of items)
  items: IBundleItem[]; // Products/services included in bundle
  sku?: string;
  categoryId?: mongoose.Types.ObjectId;
  image?: string;
  trackInventory: boolean; // Whether to track inventory for bundle items
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BundleItemSchema: Schema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  productName: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  variation: {
    size: String,
    color: String,
    type: String,
  },
});

const ProductBundleSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Bundle name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Bundle price is required'],
      min: [0, 'Price must be positive'],
    },
    items: {
      type: [BundleItemSchema],
      required: true,
      validate: {
        validator: (items: IBundleItem[]) => items.length > 0,
        message: 'Bundle must contain at least one item',
      },
    },
    sku: {
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
    trackInventory: {
      type: Boolean,
      default: true,
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

// Compound index for tenant-scoped unique SKU
ProductBundleSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });
ProductBundleSchema.index({ tenantId: 1, isActive: 1 });

const ProductBundle: Model<IProductBundle> = mongoose.models.ProductBundle || mongoose.model<IProductBundle>('ProductBundle', ProductBundleSchema);

export default ProductBundle;

