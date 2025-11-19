import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDiscount extends Document {
  tenantId: mongoose.Types.ObjectId;
  code: string;
  name?: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number; // Percentage (0-100) or fixed amount
  minPurchaseAmount?: number;
  maxDiscountAmount?: number; // For percentage discounts
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number; // Total number of times it can be used
  usageCount: number; // Current usage count
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DiscountSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    code: {
      type: String,
      required: [true, 'Discount code is required'],
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    minPurchaseAmount: {
      type: Number,
      min: 0,
    },
    maxDiscountAmount: {
      type: Number,
      min: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validUntil: {
      type: Date,
      required: true,
    },
    usageLimit: {
      type: Number,
      min: 1,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
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

// Compound index for tenant and code uniqueness
DiscountSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const Discount: Model<IDiscount> = mongoose.models.Discount || mongoose.model<IDiscount>('Discount', DiscountSchema);

export default Discount;

