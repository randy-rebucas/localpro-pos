import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDiscount extends Document {
  tenantId: mongoose.Types.ObjectId;
  code: string;
  name?: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number; // Percentage (0-100) or fixed amount
  category?: 'general' | 'senior' | 'pwd' | 'employee' | 'promo'; // BIR: Senior/PWD discount tracking
  requiresIdVerification?: boolean; // Whether ID must be verified before applying
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
      min: [0, 'Discount value must be positive'],
      validate: {
        validator: function (this: { type: string }, v: number) {
          // Percentage discounts must be 0-100
          if (this.type === 'percentage' && v > 100) {
            return false;
          }
          return true;
        },
        message: 'Percentage discount cannot exceed 100%',
      },
    },
    category: {
      type: String,
      enum: ['general', 'senior', 'pwd', 'employee', 'promo'],
      default: 'general',
    },
    requiresIdVerification: {
      type: Boolean,
      default: false,
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
      validate: {
        validator: function (this: { validFrom: Date }, v: Date) {
          return !this.validFrom || v > this.validFrom;
        },
        message: 'validUntil must be after validFrom',
      },
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

// Cascade delete protection: prevent deletion if discount has been used in transactions
async function checkDiscountDependencies(filter: Record<string, unknown>) {
  const doc = await mongoose.model('Discount').findOne(filter);
  if (!doc) return;

  if (doc.usageCount > 0) {
    throw new Error(
      `Cannot delete discount "${doc.code}": it has been used ${doc.usageCount} time(s) in transactions. Deactivate it instead (set isActive = false).`
    );
  }
}

DiscountSchema.pre('findOneAndDelete', async function (next) {
  try {
    await checkDiscountDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

DiscountSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
  try {
    await checkDiscountDependencies(this.getFilter());
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Compound index for tenant and code uniqueness
DiscountSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const Discount: Model<IDiscount> = mongoose.models.Discount || mongoose.model<IDiscount>('Discount', DiscountSchema);

export default Discount;

