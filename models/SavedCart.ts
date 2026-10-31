import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISavedCartItem {
  productId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  stock: number;
}

export interface ISavedCart extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string; // User-friendly name for the saved cart
  items: ISavedCartItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  userId: mongoose.Types.ObjectId;
  isActive: boolean;
  reminderSentAt?: Date; // Set by the abandoned-cart automation so a cart is only emailed once
  createdAt: Date;
  updatedAt: Date;
}

const SavedCartItemSchema: Schema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
});

const SavedCartSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
    },
    name: {
      type: String,
      required: [true, 'Cart name is required'],
      trim: true,
      default: 'Saved Cart',
    },
    items: {
      type: [SavedCartItemSchema],
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    discountAmount: {
      type: Number,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    reminderSentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
SavedCartSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
// Abandoned-cart cron: { tenantId, reminderSentAt: { $exists: false }, updatedAt: { $lte } }
// sorted by updatedAt desc (ESR; missing reminderSentAt is indexed as null).
SavedCartSchema.index({ tenantId: 1, reminderSentAt: 1, updatedAt: -1 });
// TTL: soft-deleted carts (isActive:false) are purged 30 days after the delete.
// The soft delete is a findOneAndUpdate, which bumps updatedAt via timestamps.
SavedCartSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { isActive: false } }
);

const SavedCart: Model<ISavedCart> = mongoose.models.SavedCart || mongoose.model<ISavedCart>('SavedCart', SavedCartSchema);

export default SavedCart;

