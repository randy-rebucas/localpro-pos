import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITaxRule extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  rate: number; // Tax percentage (0-100)
  label: string; // Display label (e.g., "VAT", "GST", "Sales Tax")
  appliesTo: 'all' | 'products' | 'services' | 'categories';
  categoryIds?: mongoose.Types.ObjectId[];
  productIds?: mongoose.Types.ObjectId[];
  region?: {
    country?: string;
    state?: string;
    city?: string;
    zipCodes?: string[];
  };
  priority: number; // Higher priority rules apply first
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRuleSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Tax rule name is required'],
      trim: true,
    },
    rate: {
      type: Number,
      required: [true, 'Tax rate is required'],
      min: 0,
      max: 100,
    },
    label: {
      type: String,
      required: [true, 'Tax label is required'],
      trim: true,
      default: 'Tax',
    },
    appliesTo: {
      type: String,
      enum: ['all', 'products', 'services', 'categories'],
      default: 'all',
    },
    categoryIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Category',
    }],
    productIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Product',
    }],
    region: {
      country: String,
      state: String,
      city: String,
      zipCodes: [String],
    },
    priority: {
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

// Compound index for tenant and active status
TaxRuleSchema.index({ tenantId: 1, isActive: 1, priority: -1 });
// Index for efficient tax rule lookup
TaxRuleSchema.index({ tenantId: 1, appliesTo: 1, isActive: 1 });

const TaxRule: Model<ITaxRule> = mongoose.models.TaxRule || mongoose.model<ITaxRule>('TaxRule', TaxRuleSchema);

export default TaxRule;
