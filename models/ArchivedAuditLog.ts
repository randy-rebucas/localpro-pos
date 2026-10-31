import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * ArchivedAuditLog — cold-storage copy of audit log entries older than the live
 * window (see lib/automations/audit-log-cleanup.ts). Kept for the BIR 10-year
 * record retention period, then purged by the TTL index below.
 * Same shape as AuditLog, plus archivedAt to track when it was moved here.
 */
export const ARCHIVED_AUDIT_LOG_RETENTION_SECONDS = 10 * 366 * 24 * 60 * 60; // ≥ 10 years
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
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
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

// Write-mostly cold storage: nothing in app/ or lib/ reads this collection yet
// (only insertMany from lib/automations/audit-log-cleanup.ts). Keep a single
// tenant/date index for compliance retrieval; add others when a reader exists.
ArchivedAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
// Purge after the retention period, measured from the original log time.
ArchivedAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ARCHIVED_AUDIT_LOG_RETENTION_SECONDS }
);

const ArchivedAuditLog: Model<IArchivedAuditLog> =
  mongoose.models.ArchivedAuditLog ||
  mongoose.model<IArchivedAuditLog>('ArchivedAuditLog', ArchivedAuditLogSchema);

export default ArchivedAuditLog;
