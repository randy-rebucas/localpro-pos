import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * ArchivedAuditLog — permanent cold-storage copy of expired audit log entries.
 * Same shape as AuditLog, plus archivedAt to track when it was moved here.
 */
export interface IArchivedAuditLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  archivedAt: Date;
  createdAt: Date; // Original log creation time (preserved from AuditLog)
}

const ArchivedAuditLogSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      index: true,
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      index: true,
    },
    entityId: {
      type: String,
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
    archivedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    // Preserve original createdAt from AuditLog (not auto-generated)
    createdAt: {
      type: Date,
      required: true,
    },
  },
  {
    // Disable automatic timestamps so we can control createdAt ourselves
    timestamps: false,
  }
);

ArchivedAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
ArchivedAuditLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
ArchivedAuditLogSchema.index({ tenantId: 1, archivedAt: -1 });

const ArchivedAuditLog: Model<IArchivedAuditLog> =
  mongoose.models.ArchivedAuditLog ||
  mongoose.model<IArchivedAuditLog>('ArchivedAuditLog', ArchivedAuditLogSchema);

export default ArchivedAuditLog;
