import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILoyaltyConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  pointsPerPeso: number;
  pesoPerPoint: number;
  minRedemption: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LoyaltyConfigSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Tenant ID is required'],
      unique: true,
    },
    pointsPerPeso: {
      type: Number,
      default: 1,
      min: [0.01, 'Points per peso must be greater than 0'],
    },
    pesoPerPoint: {
      type: Number,
      default: 0.10,
      min: [0.01, 'Peso per point must be greater than 0'],
    },
    minRedemption: {
      type: Number,
      default: 100,
      min: [1, 'Minimum redemption must be at least 1 point'],
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

LoyaltyConfigSchema.index({ tenantId: 1 });

const LoyaltyConfig: Model<ILoyaltyConfig> =
  mongoose.models.LoyaltyConfig ||
  mongoose.model<ILoyaltyConfig>('LoyaltyConfig', LoyaltyConfigSchema);

export default LoyaltyConfig;
