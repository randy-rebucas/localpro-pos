import mongoose, { Schema, Document, Model } from 'mongoose';
import type { EcommerceProvider } from '@/lib/ecommerce/constants';

export interface IProductChannelListing extends Document {
  tenantId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  provider: EcommerceProvider;
  externalProductId: string;
  externalVariantId: string;
  /** Shopify inventory_items id */
  inventoryItemId?: string;
  sku?: string;
  /** When the POS product uses variations, identifies which variant row to adjust */
  variation?: { size?: string; color?: string; type?: string };
  createdAt: Date;
  updatedAt: Date;
}

const ProductChannelListingSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['shopify', 'woocommerce'],
      required: true,
    },
    externalProductId: { type: String, required: true, trim: true },
    externalVariantId: { type: String, required: true, trim: true },
    inventoryItemId: { type: String, trim: true },
    sku: { type: String, trim: true },
    variation: {
      size: String,
      color: String,
      type: String,
    },
  },
  { timestamps: true }
);

ProductChannelListingSchema.index(
  { tenantId: 1, provider: 1, externalVariantId: 1 },
  { unique: true }
);
ProductChannelListingSchema.index({ tenantId: 1, productId: 1, provider: 1 });

const ProductChannelListing: Model<IProductChannelListing> =
  mongoose.models.ProductChannelListing ||
  mongoose.model<IProductChannelListing>('ProductChannelListing', ProductChannelListingSchema);

export default ProductChannelListing;
