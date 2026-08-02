/**
 * Automatic Audit Log Cleanup
 * Archive expired audit logs to ArchivedAuditLog, then delete from the live collection.
 * When archive=false, logs are deleted directly without archiving.
 */

import prisma from '@/lib/prisma';
import { runInTransaction } from '@/lib/db-transaction';
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
 * table before being removed from the live audit_logs table.
 */
export async function cleanupAuditLogs(
  options: AuditLogCleanupOptions = {}
): Promise<AutomationResult> {
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
    let tenants: { id: string; name?: string }[];
    if (options.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: options.tenantId },
        select: { id: true, name: true },
      });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
    }

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      try {
        const expiredLogs = await prisma.auditLog.findMany({
          where: { tenantId, createdAt: { lt: cutoffDate } },
          take: batchSize,
        });

        if (expiredLogs.length === 0) continue;

        const ids = expiredLogs.map(l => l.id);

        await runInTransaction(async (tx) => {
          if (archive) {
            // Build archive documents, preserving the original createdAt
            const archiveDocs = expiredLogs.map(log => ({
              tenantId: log.tenantId,
              userId: log.userId,
              action: log.action,
              entityType: log.entityType,
              entityId: log.entityId,
              changes: log.changes as any, // eslint-disable-line @typescript-eslint/no-explicit-any
              ipAddress: log.ipAddress,
              userAgent: log.userAgent,
              metadata: log.metadata as any, // eslint-disable-line @typescript-eslint/no-explicit-any
              createdAt: log.createdAt,
              archivedAt: new Date(),
            }));

            // Insert archive batch; continue even if some rows fail individually
            await tx.archivedAuditLog.createMany({ data: archiveDocs, skipDuplicates: true });
          }

          // Delete the expired logs from the live table
          await tx.auditLog.deleteMany({ where: { id: { in: ids } } });
        });

        results.processed += ids.length;
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
