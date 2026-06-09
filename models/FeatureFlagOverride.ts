import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFeatureFlagOverride extends Document {
  tenantId: mongoose.Types.ObjectId;
  feature: string;
  enabled: boolean;
  reason?: string;
  expiresAt?: Date;
  grantedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeatureFlagOverrideSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    feature: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

FeatureFlagOverrideSchema.index({ tenantId: 1, feature: 1 }, { unique: true });
FeatureFlagOverrideSchema.index({ expiresAt: 1 });

const FeatureFlagOverride: Model<IFeatureFlagOverride> =
  mongoose.models.FeatureFlagOverride ||
  mongoose.model<IFeatureFlagOverride>('FeatureFlagOverride', FeatureFlagOverrideSchema);

export default FeatureFlagOverride;
