/**
 * Automatic BIR Z-Reading
 *
 * Closes each store's previous business day. The job runs hourly so every timezone
 * is reached soon after its midnight, and a run that failed is picked up by the next
 * one. Days that already have a reading are left alone, including manual ones.
 * The owner's daily sales report goes out from here too, so it always shows a closed day.
 */
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import Tenant from '@/models/Tenant';
import { AuditActions } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { DEFAULT_TENANT_TIMEZONE, getTenantDateString } from '@/lib/timezone';
import { generateZReading } from '@/lib/z-reading';
import { DAILY_REPORT_TENANT_FIELDS, sendDailySalesReport } from './daily-sales-report';
import { AutomationResult } from './types';

export interface ZReadingAutomationOptions {
  tenantId?: string; // If specified, process only this tenant
  businessDate?: string; // 'YYYY-MM-DD', to fill in a missed day. Defaults to yesterday in each store's timezone.
}

const TENANT_FIELDS = `settings.timezone ${DAILY_REPORT_TENANT_FIELDS}`;

export async function generateDailyZReadings(
  options: ZReadingAutomationOptions = {}
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
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();
      const timezone = (tenant.settings?.timezone as string | undefined) || DEFAULT_TENANT_TIMEZONE;
      try {
        const day = options.businessDate ?? getTenantDateString(timezone, 1);

        // A reading can't be undone, so never lock a day that is still open
        if (day >= getTenantDateString(timezone)) {
          throw new Error(`business day ${day} has not ended yet`);
        }

        const result = await generateZReading({ tenantId, day, skipEmptyDay: true });
        if (!result) continue;

        if (result.created) {
          results.processed += 1;

          // After the reading is saved, so a logging failure can't count against it
          await AuditLog.create({
            tenantId,
            action: AuditActions.Z_READING_GENERATE,
            entityType: 'z_reading',
            entityId: result.reading._id.toString(),
            changes: {
              businessDate: result.businessDate.toISOString(),
              grossSales: result.reading.grossSales,
              beginningGT: result.reading.beginningGT,
              endingGT: result.reading.endingGT,
              transactionCount: result.reading.transactionCount,
            },
            metadata: { automated: true },
          }).catch((auditErr: unknown) => {
            logger.error(`Z-Reading audit log failed for tenant ${tenant.slug}:`, auditErr);
          });
        }

        // Not for a filled-in day, which is too old to be news to the owner
        if (!options.businessDate) {
          try {
            const failedChannels = await sendDailySalesReport(tenant, result.reading, result.businessDate, timezone);
            for (const channel of failedChannels) {
              results.errors?.push(`${tenant.slug}: daily report ${channel} failed`);
            }
          } catch (reportErr: unknown) {
            const msg = reportErr instanceof Error ? reportErr.message : String(reportErr);
            results.errors?.push(`${tenant.slug}: ${msg}`);
            logger.error(`Daily sales report failed for tenant ${tenant.slug}:`, reportErr);
          }
        }
      } catch (tenantErr: unknown) {
        results.failed += 1;
        const msg = tenantErr instanceof Error ? tenantErr.message : String(tenantErr);
        results.errors?.push(`${tenant.slug}: ${msg}`);
        logger.error(`Automatic Z-Reading failed for tenant ${tenant.slug}:`, tenantErr);
      }
    }

    results.message = `Generated ${results.processed} Z-Reading(s)${results.failed ? `, ${results.failed} failed` : ''}`;
    results.success = results.failed === 0;
    return results;
  } catch (error: unknown) {
    results.success = false;
    results.message = `Error generating Z-Readings: ${error instanceof Error ? error.message : String(error)}`;
    results.errors?.push(results.message);
    results.failed = 1;
    return results;
  }
}
