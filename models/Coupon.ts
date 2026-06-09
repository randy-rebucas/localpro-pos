import mongoose, { Schema, Document, Model } from 'mongoose';

export type DiscountType = 'percentage' | 'fixed';
export type CouponAppliesTo = 'all_plans' | 'specific_plans';

export interface ICoupon extends Document {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  appliesTo: CouponAppliesTo;
  planIds: mongoose.Types.ObjectId[];
  maxUses?: number;
  usedCount: number;
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema: Schema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: [0, 'Discount value cannot be negative'],
    },
    appliesTo: {
      type: String,
      enum: ['all_plans', 'specific_plans'],
      default: 'all_plans',
    },
    planIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
      },
    ],
    maxUses: {
      type: Number,
      min: [1, 'Max uses must be at least 1'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    validFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validUntil: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 });
CouponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

const Coupon: Model<ICoupon> =
  mongoose.models.Coupon || mongoose.model<ICoupon>('Coupon', CouponSchema);

export default Coupon;
