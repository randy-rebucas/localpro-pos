/**
 * Automatic Audit Log Archiving
 * Moves audit logs older than the retention window (default 89 days) from the
 * live AuditLog collection to ArchivedAuditLog. AuditLog's TTL deletes logs at 90
 * days, so this must run daily and archive first, or history is lost.
 * When archive=false, logs are deleted directly without archiving.
 */

import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import ArchivedAuditLog from '@/models/ArchivedAuditLog';
import { AutomationResult } from './types';

/** A day inside AuditLog's 90-day TTL, so a daily run reaches every log before it expires. */
const ARCHIVE_AFTER_DAYS = 89;

export interface AuditLogCleanupOptions {
  tenantId?: string;
  retentionDays?: number; // Days to keep logs in the live collection (default: 89)
  /** @deprecated use retentionDays */
  retentionYears?: number;
  archive?: boolean; // Copy to ArchivedAuditLog before deleting (default: true)
  batchSize?: number; // Documents moved per batch (default: 1000)
  maxBatches?: number; // Batches per run, bounds a single invocation (default: 50)
}

/**
 * Archive (or delete) audit logs older than the retention window.
 * Runs globally across tenants — one indexed range scan on createdAt instead of
 * a query per tenant. Each batch reads only `_id`s; the documents are copied
 * server-side with $merge, so they never travel to the app.
 */
export async function cleanupAuditLogs(
  options: AuditLogCleanupOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const retentionDays = options.retentionDays
    ?? (options.retentionYears != null ? options.retentionYears * 365 : ARCHIVE_AFTER_DAYS);
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

  const match: Record<string, unknown> = { createdAt: { $lt: cutoffDate } };
  if (options.tenantId) match.tenantId = options.tenantId;

  try {
    for (let batch = 0; batch < maxBatches; batch++) {
      const ids = (await AuditLog.find(match).select('_id').sort({ createdAt: 1 }).limit(batchSize).lean())
        .map((l) => l._id);
      if (ids.length === 0) break;

      if (archive) {
        // Keeps the original _id, so a retried batch doesn't duplicate archive rows
        await AuditLog.aggregate([
          { $match: { _id: { $in: ids } } },
          { $set: { archivedAt: '$$NOW' } },
          {
            $merge: {
              into: ArchivedAuditLog.collection.collectionName,
              on: '_id',
              whenMatched: 'keepExisting',
              whenNotMatched: 'insert',
            },
          },
        ]);
      }

      const deleteResult = await AuditLog.deleteMany({ _id: { $in: ids } });
      results.processed += deleteResult.deletedCount ?? 0;

      if (ids.length < batchSize) break;
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
