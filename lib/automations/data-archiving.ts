/**
 * Automated Data Archiving
 * Moves financial records past the BIR retention period (10 years) out of the
 * live collections into `<collection>_archive`, keeping the live indexes small.
 */

import connectDB from '@/lib/mongodb';
import { getAutomationTenants } from './tenants';
import { isOnlyDuplicateKeyError } from './audit-log-cleanup';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

/** BIR requires books and sales records to be kept for 10 years. */
export const MIN_ARCHIVE_YEARS = 10;

/**
 * Collections that may be archived, with the date field that ages them. Each has
 * a {tenantId, <field>} index, so finding old rows never scans the collection.
 * Records of one sale (transaction, payment, stock movements, invoice) share the
 * same timestamp, so they move together.
 */
export const ARCHIVABLE_COLLECTIONS: Record<string, string> = {
  transactions: 'createdAt',
  payments: 'createdAt',
  stockmovements: 'createdAt',
  invoices: 'createdAt',
  zreadings: 'businessDate',
  cashdrawersessions: 'openingTime',
  expenses: 'date',
};

export interface DataArchivingOptions {
  tenantId?: string;
  archiveYears?: number; // Years to keep before archiving (min/default: 10, BIR compliance)
  collections?: string[]; // Subset of ARCHIVABLE_COLLECTIONS (default: all)
  batchSize?: number; // Documents per batch (default: 1000)
  maxBatchesPerCollection?: number; // Bounds one run per tenant/collection (default: 20)
}

/**
 * Archive old data to reduce database size
 */
export async function archiveOldData(
  options: DataArchivingOptions = {}
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
    // Never archive inside the retention period, whatever the caller passes.
    const archiveYears = Math.max(MIN_ARCHIVE_YEARS, options.archiveYears || MIN_ARCHIVE_YEARS);
    const requested = options.collections ?? Object.keys(ARCHIVABLE_COLLECTIONS);
    const unknown = requested.filter((c) => !(c in ARCHIVABLE_COLLECTIONS));
    if (unknown.length > 0) {
      results.success = false;
      results.message = `Not archivable: ${unknown.join(', ')}`;
      results.errors?.push(results.message);
      return results;
    }
    const batchSize = options.batchSize ?? 1000;
    const maxBatches = options.maxBatchesPerCollection ?? 20;
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - archiveYears);

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection not available');

    // Get tenants to process
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name' });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalArchived = 0;
    let totalFailed = 0;
    const indexedArchives = new Set<string>();

    for (const tenant of tenants) {
      const tenantId = tenant._id;

      for (const collectionName of requested) {
        const dateField = ARCHIVABLE_COLLECTIONS[collectionName];
        try {
          const collection = db.collection(collectionName);
          const archiveCollection = db.collection(`${collectionName}_archive`);

          for (let batch = 0; batch < maxBatches; batch++) {
            const oldDocuments = await collection
              .find({ tenantId, [dateField]: { $lt: cutoffDate } })
              .limit(batchSize)
              .toArray();

            if (oldDocuments.length === 0) break;

            // Archives are read rarely (audits), but by tenant and date: index once.
            if (!indexedArchives.has(collectionName)) {
              await archiveCollection.createIndex({ tenantId: 1, [dateField]: -1 });
              indexedArchives.add(collectionName);
            }

            // Copies keep the original _id, so after a crash between insert and
            // delete the retry hits duplicate keys for rows already archived —
            // treat those as done and finish the delete.
            try {
              await archiveCollection.insertMany(
                oldDocuments.map((doc) => ({
                  ...doc,
                  archivedAt: new Date(),
                  originalCollection: collectionName,
                })),
                { ordered: false }
              );
            } catch (error: unknown) {
              if (!isOnlyDuplicateKeyError(error)) throw error;
            }

            const ids = oldDocuments.map((doc) => doc._id);
            const deleted = await collection.deleteMany({ tenantId, _id: { $in: ids } });
            totalArchived += deleted.deletedCount ?? 0;

            if (oldDocuments.length < batchSize) break;
          }
        } catch (error: unknown) {
          totalFailed++;
          const message = error instanceof Error ? error.message : String(error);
          results.errors?.push(`Tenant ${tenant.name}, ${collectionName}: ${message}`);
        }
      }
    }

    results.processed = totalArchived;
    results.failed = totalFailed;
    results.message = `Archived ${totalArchived} records${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    results.success = false;
    results.message = `Error archiving data: ${message}`;
    results.errors?.push(message);
    return results;
  }
}
