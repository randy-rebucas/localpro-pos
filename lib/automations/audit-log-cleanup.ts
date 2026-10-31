/**
 * Automatic Audit Log Cleanup
 * Archive expired audit logs to ArchivedAuditLog, then delete from the live collection.
 * When archive=false, logs are deleted directly without archiving.
 */

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import ArchivedAuditLog from '@/models/ArchivedAuditLog';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

export interface AuditLogCleanupOptions {
  tenantId?: string;
  retentionDays?: number; // Days to keep logs in the live collection (default: 90)
  retentionYears?: number; // Legacy alternative to retentionDays; ignored when retentionDays is set
  archive?: boolean; // Copy to ArchivedAuditLog before deleting (default: true)
  batchSize?: number; // Documents per batch (default: 500)
  maxBatchesPerTenant?: number; // Bounds one run's duration (default: 40)
}

/** Live-collection window; older logs move to ArchivedAuditLog (kept 10 years). */
export const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 90;

/**
 * True when an insertMany failure consists solely of duplicate-key (11000) errors,
 * i.e. every failed document is already present in the target collection.
 */
export function isOnlyDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  type WriteErr = { code?: number; err?: { code?: number } };
  const err = error as {
    code?: number;
    writeErrors?: WriteErr | WriteErr[];
    mongoose?: { validationErrors?: unknown[] };
  };
  // Mongoose attaches unordered-insert validation failures here; those documents
  // were NOT archived, so this is never "only duplicates".
  if ((err.mongoose?.validationErrors?.length ?? 0) > 0) return false;
  // MongoBulkWriteError.writeErrors is a single WriteError or an array of them.
  const writeErrors = err.writeErrors == null
    ? []
    : Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors];
  if (writeErrors.length > 0) {
    return writeErrors.every(we => (we.code ?? we.err?.code) === 11000);
  }
  return err.code === 11000;
}

/** Archive (optionally) and delete one batch of a tenant's expired logs. */
async function moveExpiredBatch(
  tenantId: string,
  cutoffDate: Date,
  batchSize: number,
  archive: boolean
): Promise<{ found: number; deleted: number }> {
  const expiredLogs = await AuditLog.find({
    tenantId,
    createdAt: { $lt: cutoffDate },
  })
    .limit(batchSize)
    .lean();

  if (expiredLogs.length === 0) return { found: 0, deleted: 0 };

  if (archive) {
    // Build archive documents, preserving the original _id and createdAt.
    // Keeping _id makes the archive step idempotent: if a previous run crashed
    // after inserting but before deleting, re-inserting hits duplicate keys
    // instead of creating duplicate archive rows.
    const archiveDocs = expiredLogs.map(log => ({
      _id: log._id,
      tenantId: log.tenantId,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      changes: log.changes,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt,
      archivedAt: new Date(),
    }));

    // Insert archive batch (ordered:false continues past duplicates). Rows that
    // are already archived (duplicate _id) count as archived; any other error
    // aborts this tenant before the originals are deleted.
    try {
      // throwOnValidationError: never silently skip a doc and then delete its original.
      await ArchivedAuditLog.insertMany(archiveDocs, { ordered: false, throwOnValidationError: true });
    } catch (error: unknown) {
      if (!isOnlyDuplicateKeyError(error)) throw error;
    }
  }

  // Delete the expired logs from the live collection
  const ids = expiredLogs.map(l => l._id);
  const deleteResult = await AuditLog.deleteMany({ tenantId, _id: { $in: ids } });
  return { found: expiredLogs.length, deleted: deleteResult.deletedCount ?? 0 };
}

/**
 * Clean up old audit logs based on retention policy.
 * When archive=true (default), expired logs are copied to the archived_audit_logs
 * collection before being removed from the live audit_logs collection.
 */
export async function cleanupAuditLogs(
  options: AuditLogCleanupOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const archive = options.archive ?? true;
  const batchSize = options.batchSize ?? 500;
  const maxBatches = options.maxBatchesPerTenant ?? 40;

  const cutoffDate = new Date();
  if (options.retentionDays == null && options.retentionYears != null) {
    cutoffDate.setFullYear(cutoffDate.getFullYear() - options.retentionYears);
  } else {
    cutoffDate.setDate(cutoffDate.getDate() - (options.retentionDays ?? DEFAULT_AUDIT_LOG_RETENTION_DAYS));
  }

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get tenants to process
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name' });

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();

      try {
        // Loop so a backlog (e.g. the first run after the TTL was removed) drains
        // in one run instead of 500 logs per tenant per week.
        for (let batch = 0; batch < maxBatches; batch++) {
          const { found, deleted } = await moveExpiredBatch(tenantId, cutoffDate, batchSize, archive);
          results.processed += deleted;
          if (found < batchSize) break;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.failed++;
        results.errors?.push(`Tenant ${tenant.name ?? tenantId}: ${message}`);
      }
    }

    const action = archive ? 'Archived and deleted' : 'Deleted';
    results.message = `${action} ${results.processed} audit log(s)${results.failed > 0 ? `, ${results.failed} tenant(s) failed` : ''}`;
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.message = `Error cleaning up audit logs: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
