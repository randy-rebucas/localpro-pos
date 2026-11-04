/**
 * Automatic Audit Log Archiving
 * Moves audit logs older than the retention window (default 90 days) from the
 * live AuditLog collection to ArchivedAuditLog. AuditLog has no TTL index —
 * this job is what keeps the live collection small, so it runs daily.
 * When archive=false, logs are deleted directly without archiving.
 */

import { getRepos } from '@/lib/db';
import { AutomationResult } from './types';

export interface AuditLogCleanupOptions {
  tenantId?: string;
  retentionDays?: number; // Days to keep logs in the live collection (default: 90)
  /** @deprecated use retentionDays */
  retentionYears?: number;
  archive?: boolean; // Copy to ArchivedAuditLog before deleting (default: true)
  batchSize?: number; // Documents moved per batch (default: 1000)
  maxBatches?: number; // Batches per run, bounds a single invocation (default: 50)
}

/**
 * Archive (or delete) audit logs older than the retention window.
 * Runs globally across tenants — one indexed range scan on createdAt instead of
 * a query per tenant. The rows are moved inside the database, so they never
 * travel to the app.
 */
export async function cleanupAuditLogs(
  options: AuditLogCleanupOptions = {}
): Promise<AutomationResult> {
  const retentionDays = options.retentionDays
    ?? (options.retentionYears != null ? options.retentionYears * 365 : 90);
  const archive = options.archive ?? true;
  const batchSize = options.batchSize ?? 1000;
  const maxBatches = options.maxBatches ?? 50;

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    for (let batch = 0; batch < maxBatches; batch++) {
      const { found, removed } = await getRepos().auditLogs.retireBatch(options.tenantId ?? null, {
        before: cutoffDate,
        limit: batchSize,
        archive,
      });
      results.processed += removed;

      if (found < batchSize) break;
    }

    const action = archive ? 'Archived' : 'Deleted';
    results.message = `${action} ${results.processed} audit log(s) older than ${retentionDays} days`;
    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.failed++;
    results.message = `Error cleaning up audit logs: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
