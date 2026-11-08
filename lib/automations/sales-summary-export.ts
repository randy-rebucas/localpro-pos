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
import { safeFetch } from '@/lib/net/outbound-url';
import Tenant from '@/models/Tenant';
import { getDailySalesAggregate, startOfBusinessDay } from '@/lib/bir-readings';
import { formatGrandTotalRegister } from '@/lib/bir-format';
import { logger } from '@/lib/logger';
import { DEFAULT_TENANT_TIMEZONE, getTenantDateString } from '@/lib/timezone';
import { AutomationResult } from './types';

// Lazy-load Node.js fs/path to avoid bundling them into client/edge code paths.
/* turbopackIgnore: true */
const _importFs = () => import('fs/promises');
/* turbopackIgnore: true */
const _importPath = () => import('path');

export interface SalesSummaryExportOptions {
  tenantId?: string; // If specified, export only this tenant
  period: 'daily' | 'monthly';
  businessDate?: Date; // Defaults to yesterday (daily) or last month (monthly)
  exportPath?: string;
}

export interface SalesSummaryPayload {
  tenantId: string;
  tenantSlug: string;
  period: 'daily' | 'monthly';
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
  refundCount: number;
  refundTotal: number;
  refundVatAmount: number;
  netSales: number;
  grandTotalSales: number;
  grandTotalRegister: string; // zero-padded 10-digit display format
  generatedAt: string;
}

/**
 * Aggregates a tenant's sales over a month by summing each day's aggregate.
 * Reuses getDailySalesAggregate so daily and monthly figures are always
 * consistent with each other and with the X/Z-Reading reports.
 */
async function aggregateMonth(tenantId: string, firstDay: string, timezone: string) {
  const day = new Date(`${firstDay}T12:00:00Z`);
  const month = day.getUTCMonth();

  const totals = {
    grossSales: 0, vatableSales: 0, vatAmount: 0, vatExemptSales: 0,
    zeroRatedSales: 0, discountTotal: 0, transactionCount: 0, voidCount: 0,
    refundCount: 0, refundTotal: 0, refundVatAmount: 0, netSales: 0,
  };

  for (; day.getUTCMonth() === month; day.setUTCDate(day.getUTCDate() + 1)) {
    const daily = await getDailySalesAggregate(tenantId, day.toISOString().slice(0, 10), timezone);
    totals.grossSales += daily.grossSales;
    totals.vatableSales += daily.vatableSales;
    totals.vatAmount += daily.vatAmount;
    totals.vatExemptSales += daily.vatExemptSales;
    totals.zeroRatedSales += daily.zeroRatedSales;
    totals.discountTotal += daily.discountTotal;
    totals.transactionCount += daily.transactionCount;
    totals.voidCount += daily.voidCount;
    totals.refundCount += daily.refundCount;
    totals.refundTotal += daily.refundTotal;
    totals.refundVatAmount += daily.refundVatAmount;
    totals.netSales += daily.netSales;
  }

  return {
    ...totals,
    startDate: startOfBusinessDay(firstDay, timezone),
    // The loop has already stepped onto the first of the next month
    endDate: startOfBusinessDay(day.toISOString().slice(0, 10), timezone),
  };
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
    const tenants = options.tenantId
      ? await Tenant.find({ _id: options.tenantId, isActive: true }).lean()
      : await Tenant.find({ isActive: true }).lean();

    if (tenants.length === 0) {
      results.message = 'No active tenants found to export';
      return results;
    }

    const fs = await _importFs();
    const path = await _importPath();
    const exportDir = options.exportPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'backups', 'esales');
    await fs.mkdir(exportDir, { recursive: true }).catch(() => {});

    for (const tenant of tenants) {
      const tenantId = tenant._id.toString();
      const timezone = tenant.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
      try {
        let aggregate: { grossSales: number; vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number; discountTotal: number; transactionCount: number; voidCount: number; refundCount: number; refundTotal: number; refundVatAmount: number; netSales: number; startDate: Date; endDate: Date };

        if (options.period === 'daily') {
          // Yesterday by default, a full day of data
          const businessDate = options.businessDate ?? getTenantDateString(timezone, 1);
          aggregate = await getDailySalesAggregate(tenantId, businessDate, timezone);
        } else {
          let firstDay: string;
          if (options.businessDate) {
            firstDay = `${options.businessDate.toLocaleDateString('en-CA', { timeZone: timezone }).slice(0, 7)}-01`;
          } else {
            const [year, month] = getTenantDateString(timezone).split('-').map(Number);
            firstDay = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10); // last month
          }
          aggregate = await aggregateMonth(tenantId, firstDay, timezone);
        }

        const payload: SalesSummaryPayload = {
          tenantId,
          tenantSlug: tenant.slug,
          period: options.period,
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
          refundCount: aggregate.refundCount,
          refundTotal: aggregate.refundTotal,
          refundVatAmount: aggregate.refundVatAmount,
          netSales: aggregate.netSales,
          grandTotalSales: tenant.grandTotalSales || 0,
          grandTotalRegister: formatGrandTotalRegister(tenant.grandTotalSales || 0),
          generatedAt: new Date().toISOString(),
        };

        const fileName = `${tenant.slug}-${options.period}-${aggregate.startDate.toLocaleDateString('en-CA', { timeZone: timezone })}.json`;
        await fs.writeFile(path.join(exportDir, fileName), JSON.stringify(payload, null, 2), 'utf-8');

        // Push to tenant-configured endpoint, if any (best-effort — local file is the source of truth).
        const pushUrl = tenant.settings?.birEsalesPushUrl;
        if (pushUrl) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            // Tenant-supplied endpoint: SSRF-guarded (public https only, redirects re-checked)
            const res = await safeFetch(pushUrl, {
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
