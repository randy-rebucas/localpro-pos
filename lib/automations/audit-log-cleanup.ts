/**
 * Automatic Audit Log Cleanup
 * Archive expired audit logs to ArchivedAuditLog, then delete from the live collection.
 * When archive=false, logs are deleted directly without archiving.
 */

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import ArchivedAuditLog from '@/models/ArchivedAuditLog';
import Tenant from '@/models/Tenant';
import { AutomationResult } from './types';

export interface AuditLogCleanupOptions {
  tenantId?: string;
  retentionYears?: number; // Years to keep logs in the live collection (default: 2)
  archive?: boolean; // Copy to ArchivedAuditLog before deleting (default: true)
  batchSize?: number; // Documents to process per tenant per run (default: 500)
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

  const retentionYears = options.retentionYears ?? 2;
  const archive = options.archive ?? true;
  const batchSize = options.batchSize ?? 500;

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get tenants to process
    let tenants: { _id: { toString(): string }; name?: string }[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).select('_id name').lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).select('_id name').lean();
    }

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();

      try {
        const expiredLogs = await AuditLog.find({
          tenantId,
          createdAt: { $lt: cutoffDate },
        })
          .limit(batchSize)
          .lean();

        if (expiredLogs.length === 0) continue;

        if (archive) {
          // Build archive documents, preserving the original createdAt
          const archiveDocs = expiredLogs.map(log => ({
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

          // Insert archive batch (ordered:false continues on partial failures)
          await ArchivedAuditLog.insertMany(archiveDocs, { ordered: false });
        }

        // Delete the expired logs from the live collection
        const ids = expiredLogs.map(l => l._id);
        const deleteResult = await AuditLog.deleteMany({ _id: { $in: ids } });
        results.processed += deleteResult.deletedCount ?? 0;
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
