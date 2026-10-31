/**
 * BIR Sales Summary Export ("Push" functionality)
 *
 * Cloud-hosted BIR POS systems are expected to have built-in capability to
 * transmit daily/monthly sales summaries — preparing for BIR's Electronic
 * Invoicing System (EIS) / eSales data transfer formats (JSON). This
 * generates a per-tenant sales-summary JSON file for a given period and,
 * if the tenant has configured a push endpoint, POSTs it there.
 */
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getDailySalesAggregate, getSalesAggregateForRange, startOfBusinessDay } from '@/lib/bir-readings';
import { addDaysToYmd, getTenantLocalParts, getTenantTimezone, getTenantYmd } from '@/lib/timezone';
import { formatGrandTotalRegister } from '@/lib/bir-format';
import { logger } from '@/lib/logger';
import { AutomationResult } from './types';

// Lazy-load Node.js fs/path to avoid bundling them into client/edge code paths.
/* turbopackIgnore: true */
const _importFs = () => import('fs/promises');
/* turbopackIgnore: true */
const _importPath = () => import('path');

export interface SalesSummaryExportOptions {
  tenantId?: string; // If specified, export only this tenant
  period: 'daily' | 'monthly';
  // Any instant within the target day/month, judged in each tenant's timezone.
  // Defaults to yesterday (daily) or last month (monthly) in the tenant's timezone.
  businessDate?: Date;
  exportPath?: string;
}

export interface SalesSummaryPayload {
  tenantId: string;
  tenantSlug: string;
  period: 'daily' | 'monthly';
  timezone: string; // tenant IANA timezone the business day/month is computed in
  businessDate: string; // tenant-local 'YYYY-MM-DD' (first day of the month for monthly)
  startDate: string;
  endDate: string;
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  discountTotal: number;
  transactionCount: number;
  voidCount: number;
  grandTotalSales: number;
  grandTotalRegister: string; // zero-padded 10-digit display format
  generatedAt: string;
}

/**
 * 'YYYY-MM-01' of the tenant-local month to export: the month containing
 * `ref`, or (no ref) the month before the current tenant-local month.
 */
export function resolveExportMonthStartYmd(ref: Date | undefined, tz: string, now: Date = new Date()): string {
  const { year, month } = getTenantLocalParts(ref ?? now, tz);
  const [y, m] = ref ? [year, month] : month === 1 ? [year - 1, 12] : [year, month - 1];
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Tenant-local 'YYYY-MM-DD' to export daily: the day containing `ref`, or (no ref) yesterday. */
export function resolveExportDayYmd(ref: Date | undefined, tz: string, now: Date = new Date()): string {
  return ref ? getTenantYmd(ref, tz) : addDaysToYmd(getTenantYmd(now, tz), -1);
}

/**
 * Aggregates a tenant's sales over one tenant-local calendar month,
 * [local 00:00 on the 1st, local 00:00 on the 1st of the next month).
 * Uses the same aggregation as getDailySalesAggregate (and the X/Z-Readings),
 * over the whole month's range in one query, so monthly figures equal the sum
 * of the daily ones.
 */
async function aggregateMonth(tenantId: string, monthStartYmd: string, tz: string) {
  const [y, m] = monthStartYmd.split('-').map(Number);
  const nextMonthYmd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return getSalesAggregateForRange(
    tenantId,
    startOfBusinessDay(monthStartYmd, tz),
    startOfBusinessDay(nextMonthYmd, tz)
  );
}

export async function generateSalesSummaryExport(
  options: SalesSummaryExportOptions
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
    // On serverless hosts (Vercel) the filesystem is read-only and ephemeral, so a
    // local export file is useless: only tenants with a push endpoint get a
    // summary, and no file is written. Self-hosted keeps the file export for all.
    const pushOnly = !!process.env.VERCEL && !options.exportPath;
    const tenantFilter: Record<string, unknown> = options.tenantId
      ? { _id: options.tenantId, isActive: true }
      : { isActive: true };
    if (pushOnly) tenantFilter['settings.birEsalesPushUrl'] = { $nin: [null, ''] };

    const tenants = await Tenant.find(tenantFilter)
      .select('slug grandTotalSales settings.birEsalesPushUrl settings.timezone')
      .lean();

    if (tenants.length === 0) {
      results.message = pushOnly
        ? 'No active tenants with an eSales push endpoint'
        : 'No active tenants found to export';
      return results;
    }

    const fs = await _importFs();
    const path = await _importPath();
    const exportDir = options.exportPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'backups', 'esales');
    if (!pushOnly) await fs.mkdir(exportDir, { recursive: true }).catch(() => {});

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();
      try {
        let aggregate: { grossSales: number; vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number; discountTotal: number; transactionCount: number; voidCount: number; startDate: Date; endDate: Date };
        // Business days/months are the tenant's local calendar (server clock is UTC on Vercel).
        const tz = getTenantTimezone(tenant.settings);
        let businessDateYmd: string;

        if (options.period === 'daily') {
          businessDateYmd = resolveExportDayYmd(options.businessDate, tz); // default: yesterday (full day of data)
          aggregate = await getDailySalesAggregate(tenantId, businessDateYmd, tz);
        } else {
          businessDateYmd = resolveExportMonthStartYmd(options.businessDate, tz); // default: last month
          aggregate = await aggregateMonth(tenantId, businessDateYmd, tz);
        }

        const payload: SalesSummaryPayload = {
          tenantId,
          tenantSlug: tenant.slug,
          period: options.period,
          timezone: tz,
          businessDate: businessDateYmd,
          startDate: aggregate.startDate.toISOString(),
          endDate: aggregate.endDate.toISOString(),
          grossSales: aggregate.grossSales,
          vatableSales: aggregate.vatableSales,
          vatAmount: aggregate.vatAmount,
          vatExemptSales: aggregate.vatExemptSales,
          zeroRatedSales: aggregate.zeroRatedSales,
          discountTotal: aggregate.discountTotal,
          transactionCount: aggregate.transactionCount,
          voidCount: aggregate.voidCount,
          grandTotalSales: tenant.grandTotalSales || 0,
          grandTotalRegister: formatGrandTotalRegister(tenant.grandTotalSales || 0),
          generatedAt: new Date().toISOString(),
        };

        // Name by the tenant-local date: startDate is local midnight as UTC, i.e. the previous UTC day in Manila.
        const fileName = `${tenant.slug}-${options.period}-${businessDateYmd}.json`;
        if (!pushOnly) {
          await fs.writeFile(path.join(exportDir, fileName), JSON.stringify(payload, null, 2), 'utf-8');
        }

        // Push to tenant-configured endpoint, if any (best-effort — local file is the source of truth).
        const pushUrl = tenant.settings?.birEsalesPushUrl;
        if (pushUrl) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(pushUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!res.ok) {
              throw new Error(`Push endpoint responded with HTTP ${res.status}`);
            }
          } catch (pushErr: unknown) {
            // With no local file (serverless), the push is the export: count it as failed.
            if (pushOnly) throw pushErr;
            const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
            results.errors?.push(`${tenant.slug}: push failed — ${msg}`);
            logger.warn(`Sales summary push failed for tenant ${tenant.slug}: ${msg}`);
            // Don't count as a hard failure — the local export still succeeded.
          }
        }

        results.processed += 1;
      } catch (tenantErr: unknown) {
        results.failed += 1;
        const msg = tenantErr instanceof Error ? tenantErr.message : String(tenantErr);
        results.errors?.push(`${tenant.slug}: ${msg}`);
        logger.error(`Sales summary export failed for tenant ${tenant.slug}:`, tenantErr);
      }
    }

    results.message = `Exported ${options.period} sales summary for ${results.processed} tenant(s)${results.failed ? `, ${results.failed} failed` : ''}`;
    results.success = results.failed === 0;
    return results;
  } catch (error: unknown) {
    results.success = false;
    results.message = `Error generating sales summary export: ${error instanceof Error ? error.message : String(error)}`;
    results.errors?.push(results.message);
    results.failed = 1;
    return results;
  }
}
