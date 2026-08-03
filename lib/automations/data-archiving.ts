/**
 * Automated Data Archiving
 * Automatically archive old data to reduce database size
 */

import prisma from '@/lib/prisma';
import { AutomationResult } from './types';

export interface DataArchivingOptions {
  tenantId?: string;
  archiveYears?: number; // Years to keep before archiving (default: 10, BIR compliance)
  collections?: string[]; // Collections to archive (default: ['transactions'])
}

// TODO: Archiving arbitrary tables generically (copying rows into a sibling
// `${table}_archive` table created on the fly, then deleting the originals)
// isn't supported. Postgres has no equivalent of creating an ad-hoc table at
// runtime from an unvalidated caller-supplied name (and doing so via raw SQL
// with an externally-supplied identifier would be a SQL-injection risk).
// `prisma/schema.prisma` currently only has a cold-storage table for audit
// logs (`ArchivedAuditLog`, see its doc-comment) — there is no
// `ArchivedTransaction` model. Until one is added (mirroring the
// ArchivedAuditLog pattern: same shape + archivedAt, FK to Tenant), this
// automation intentionally does NOT delete any live Transaction rows — BIR
// requires 10-year retention of transaction records, and deleting without a
// verified archive destination would be a compliance/data-loss risk. For now
// it only reports how many records are eligible for archiving so operators
// know when the ArchivedTransaction table needs to be added.
const SUPPORTED_COLLECTIONS = ['transactions'];

/**
 * Report on old data eligible for archiving to reduce database size.
 * Only the `transactions` collection is currently recognized (see TODO
 * above); other collection names are reported as unsupported.
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

    let totalEligible = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;

        for (const collectionName of collections) {
          try {
            if (!SUPPORTED_COLLECTIONS.includes(collectionName)) {
              totalFailed++;
              results.errors?.push(`Collection ${collectionName}: not supported (no archive table defined)`);
              continue;
            }

            const eligibleCount = await prisma.transaction.count({
              where: { tenantId, createdAt: { lt: cutoffDate } },
            });

            if (eligibleCount === 0) continue;

            totalEligible += eligibleCount;
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

    results.processed = totalEligible;
    results.failed = totalFailed;
    results.message = `${totalEligible} record(s) eligible for archiving (not archived — ArchivedTransaction table not yet implemented, see TODO in data-archiving.ts)${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error archiving data: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
