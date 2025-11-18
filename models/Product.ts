import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduct extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  category?: string;
  image?: string;
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
    image: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for tenant-scoped unique SKU
ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });

const Product: Model<IProduct> = mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;

