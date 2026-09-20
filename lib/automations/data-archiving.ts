/**
 * Automated Data Archiving
 * Automatically archive old data to reduce database size
 */

import prisma, { dbTransaction } from '@/lib/db';
import { AutomationResult } from './types';

export interface DataArchivingOptions {
  tenantId?: string;
  archiveYears?: number; // Years to keep before archiving (default: 10, BIR compliance)
  collections?: string[]; // Collections to archive (default: ['transactions'])
}

/**
 * Archive old data to reduce database size
 */
export async function archiveOldData(
  options: DataArchivingOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const archiveYears = options.archiveYears || 10; // BIR requires 10-year retention
    const collections = options.collections || ['transactions'];
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - archiveYears);

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalArchived = 0;
    let totalFailed = 0;

    // Only the `transactions` table is supported for archiving today (Postgres table
    // name, matching the Mongoose collection name this replaces). Other names are
    // reported as unsupported rather than silently skipped.
    const TABLE_MAP: Record<string, string> = { transactions: 'transactions' };
    const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        for (const collectionName of collections) {
          try {
            const tableName = TABLE_MAP[collectionName];
            if (!tableName || !SAFE_IDENT.test(tableName)) {
              results.errors?.push(`Collection ${collectionName}: unsupported for archiving`);
              continue;
            }
            const archiveTable = `${tableName}_archive`;

            const archived = await dbTransaction(async (tx) => {
              // Ensure the archive table exists, shaped like the source table plus
              // bookkeeping columns (created once; a no-op on subsequent runs).
              await tx.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "${archiveTable}" (
                  LIKE "${tableName}" INCLUDING ALL
                );
              `);
              await tx.$executeRawUnsafe(`
                ALTER TABLE "${archiveTable}"
                  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
                  ADD COLUMN IF NOT EXISTS "originalCollection" TEXT;
              `);

              // Move old rows: insert into archive, then delete from source, scoped to tenant.
              const inserted: Array<{ id: string }> = await tx.$queryRawUnsafe(`
                INSERT INTO "${archiveTable}"
                SELECT s.*, now() AS "archivedAt", $1 AS "originalCollection"
                FROM "${tableName}" s
                WHERE s."tenantId" = $2 AND s."createdAt" < $3
                LIMIT 1000
                RETURNING id;
              `, collectionName, tenantId, cutoffDate);

              if (inserted.length > 0) {
                const ids = inserted.map((r) => r.id);
                await tx.$executeRawUnsafe(
                  `DELETE FROM "${tableName}" WHERE id = ANY($1::text[]);`,
                  ids
                );
              }

              return inserted.length;
            });

            totalArchived += archived;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Collection ${collectionName}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalArchived;
    results.failed = totalFailed;
    results.message = `Archived ${totalArchived} records${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error archiving data: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
