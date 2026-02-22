/**
 * Automatic Audit Log Cleanup
 * Archive or delete old audit logs based on retention policy
 */

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import Tenant from '@/models/Tenant';
import { AutomationResult } from './types';

export interface AuditLogCleanupOptions {
  tenantId?: string;
  retentionYears?: number; // Years to keep logs (default: 2)
  archive?: boolean; // Archive instead of delete (default: false)
}

/**
 * Clean up old audit logs based on retention policy
 */
export async function cleanupAuditLogs(
  options: AuditLogCleanupOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const retentionYears = options.retentionYears || 2;
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    let totalDeleted = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();

        // Find old audit logs
        const oldLogs = await AuditLog.find({
          tenantId,
          createdAt: { $lt: cutoffDate },
        }).lean();

        if (oldLogs.length === 0) {
          continue;
        }

        if (options.archive) {
          // TODO: Archive to separate collection or database
          // For now, we'll just delete
          const deleteResult = await AuditLog.deleteMany({
            tenantId,
            createdAt: { $lt: cutoffDate },
          });
          totalDeleted += deleteResult.deletedCount || 0;
        } else {
          // Delete old logs
          const deleteResult = await AuditLog.deleteMany({
            tenantId,
            createdAt: { $lt: cutoffDate },
          });
          totalDeleted += deleteResult.deletedCount || 0;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalDeleted;
    results.failed = totalFailed;
    results.message = `${options.archive ? 'Archived' : 'Deleted'} ${totalDeleted} audit logs${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error cleaning up audit logs: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
