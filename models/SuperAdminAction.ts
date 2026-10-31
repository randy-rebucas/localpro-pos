import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISuperAdminAction extends Document {
  adminUserId: mongoose.Types.ObjectId;
  action: string;
  targetType?: string;
  targetId?: string;
  description?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const SuperAdminActionSchema: Schema = new Schema(
  {
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    targetType: {
      type: String,
    },
    targetId: {
      type: String,
    },
    description: {
      type: String,
      trim: true,
    },
    changes: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Admin log viewer (app/api/super-admin/admin-logs): optional adminUserId /
// targetType equality, optional createdAt range, always sorted by createdAt desc.
// `action` is filtered with an unanchored case-insensitive regex, which cannot
// use an index efficiently, so it is not indexed.
SuperAdminActionSchema.index({ adminUserId: 1, createdAt: -1 });
SuperAdminActionSchema.index({ targetType: 1, createdAt: -1 });
// Retention: kept 10 years (covers billing/plan changes made by admins, matching
// the BIR record period). This single index also serves the createdAt sort.
export const SUPER_ADMIN_ACTION_RETENTION_SECONDS = 10 * 366 * 24 * 60 * 60;
SuperAdminActionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: SUPER_ADMIN_ACTION_RETENTION_SECONDS }
);

const SuperAdminAction: Model<ISuperAdminAction> =
  mongoose.models.SuperAdminAction ||
  mongoose.model<ISuperAdminAction>('SuperAdminAction', SuperAdminActionSchema);

export default SuperAdminAction;
