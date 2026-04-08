import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITier {
  minSale: number;
  rate: number; // percentage
}

export interface ICommissionRule extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  type: 'percentage' | 'flat' | 'tiered';
  rate?: number; // Used for percentage or flat types
  tiers?: ITier[]; // Used for tiered type
  staffIds: mongoose.Types.ObjectId[]; // Empty = applies to all staff
  productCategories: string[]; // Empty = applies to all categories
  minimumSale: number; // Minimum transaction total to qualify
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionRuleSchema: Schema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    type: { type: String, enum: ['percentage', 'flat', 'tiered'], required: true },
    rate: { type: Number, min: 0 },
    tiers: [
      {
        minSale: { type: Number, required: true },
        rate: { type: Number, required: true },
      },
    ],
    staffIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    productCategories: [{ type: String }],
    minimumSale: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

CommissionRuleSchema.index({ tenantId: 1, isActive: 1 });

const CommissionRule: Model<ICommissionRule> =
  mongoose.models.CommissionRule ||
  mongoose.model<ICommissionRule>('CommissionRule', CommissionRuleSchema);

export default CommissionRule;
