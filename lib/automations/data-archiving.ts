/**
 * Automated Data Archiving
 * Automatically archive old data to reduce database size
 */

import { getRepos } from '@/lib/db';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
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
    // Only _id/name are needed here — no settings
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: '_id slug name' })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalArchived = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        for (const collectionName of collections) {
          try {
            // Process in batches
            totalArchived += await getRepos().dataArchive.moveOlderThan(tenantId, collectionName, {
              before: cutoffDate,
              limit: 1000,
            });
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
