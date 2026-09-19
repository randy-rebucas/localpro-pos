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
      index: true,
    },
    targetType: {
      type: String,
      index: true,
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

SuperAdminActionSchema.index({ adminUserId: 1, createdAt: -1 });
SuperAdminActionSchema.index({ createdAt: -1 });
SuperAdminActionSchema.index({ targetType: 1, targetId: 1 });

const SuperAdminAction: Model<ISuperAdminAction> =
  mongoose.models.SuperAdminAction ||
  mongoose.model<ISuperAdminAction>('SuperAdminAction', SuperAdminActionSchema);

export default SuperAdminAction;
