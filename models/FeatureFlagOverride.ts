import mongoose, { Schema, Document, Model } from 'mongoose';
import { invalidateSubscriptionCache } from '@/lib/db-cache';

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

// Serves every query (by tenantId, or tenantId + feature). No query filters on
// expiresAt, so it is not indexed.
FeatureFlagOverrideSchema.index({ tenantId: 1, feature: 1 }, { unique: true });

// Overrides are folded into the cached subscription status (lib/subscription.ts);
// drop the tenant's cached status whenever an override changes.
function invalidateForFilter(filter: Record<string, unknown> | undefined) {
  const tenantId = filter?.tenantId;
  if (tenantId && (typeof tenantId === 'string' || tenantId instanceof mongoose.Types.ObjectId)) {
    invalidateSubscriptionCache(tenantId.toString());
  } else {
    invalidateSubscriptionCache();
  }
}

FeatureFlagOverrideSchema.post(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function () {
    invalidateForFilter(this.getFilter());
  }
);
FeatureFlagOverrideSchema.post('save', function (doc: IFeatureFlagOverride) {
  invalidateSubscriptionCache(doc.tenantId?.toString());
});

const FeatureFlagOverride: Model<IFeatureFlagOverride> =
  mongoose.models.FeatureFlagOverride ||
  mongoose.model<IFeatureFlagOverride>('FeatureFlagOverride', FeatureFlagOverrideSchema);

export default FeatureFlagOverride;
