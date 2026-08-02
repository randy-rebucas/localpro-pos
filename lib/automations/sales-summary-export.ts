/**
 * BIR Sales Summary Export ("Push" functionality)
 *
 * Cloud-hosted BIR POS systems are expected to have built-in capability to
 * transmit daily/monthly sales summaries — preparing for BIR's Electronic
 * Invoicing System (EIS) / eSales data transfer formats (JSON). This
 * generates a per-tenant sales-summary JSON file for a given period and,
 * if the tenant has configured a push endpoint, POSTs it there.
 */
import prisma from '@/lib/prisma';
import { getDailySalesAggregate, startOfBusinessDay } from '@/lib/bir-readings';
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
  grandTotalSales: number;
  grandTotalRegister: string; // zero-padded 10-digit display format
  generatedAt: string;
}

/**
 * Aggregates a tenant's sales over a month by summing each day's aggregate.
 * Reuses getDailySalesAggregate so daily and monthly figures are always
 * consistent with each other and with the X/Z-Reading reports.
 */
async function aggregateMonth(tenantId: string, monthStart: Date) {
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const totals = {
    grossSales: 0, vatableSales: 0, vatAmount: 0, vatExemptSales: 0,
    zeroRatedSales: 0, discountTotal: 0, transactionCount: 0, voidCount: 0,
  };

  for (let day = new Date(monthStart); day < monthEnd; day.setDate(day.getDate() + 1)) {
    const daily = await getDailySalesAggregate(tenantId, new Date(day));
    totals.grossSales += daily.grossSales;
    totals.vatableSales += daily.vatableSales;
    totals.vatAmount += daily.vatAmount;
    totals.vatExemptSales += daily.vatExemptSales;
    totals.zeroRatedSales += daily.zeroRatedSales;
    totals.discountTotal += daily.discountTotal;
    totals.transactionCount += daily.transactionCount;
    totals.voidCount += daily.voidCount;
  }

  return { ...totals, startDate: monthStart, endDate: monthEnd };
}

export async function generateSalesSummaryExport(
  options: SalesSummaryExportOptions
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const tenants = options.tenantId
      ? await prisma.tenant.findMany({ where: { id: options.tenantId, isActive: true } })
      : await prisma.tenant.findMany({ where: { isActive: true } });

    if (tenants.length === 0) {
      results.message = 'No active tenants found to export';
      return results;
    }

    const fs = await _importFs();
    const path = await _importPath();
    const exportDir = options.exportPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'backups', 'esales');
    await fs.mkdir(exportDir, { recursive: true }).catch(() => {});

    for (const tenant of tenants) {
      const tenantId = tenant.id;
      try {
        let aggregate: { grossSales: number; vatableSales: number; vatAmount: number; vatExemptSales: number; zeroRatedSales: number; discountTotal: number; transactionCount: number; voidCount: number; startDate: Date; endDate: Date };

        if (options.period === 'daily') {
          const businessDate = options.businessDate ?? (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1); // yesterday, by default (full day of data)
            return d;
          })();
          aggregate = await getDailySalesAggregate(tenantId, businessDate);
        } else {
          const monthStart = options.businessDate
            ? startOfBusinessDay(new Date(options.businessDate.getFullYear(), options.businessDate.getMonth(), 1))
            : (() => {
                const now = new Date();
                return startOfBusinessDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)); // last month
              })();
          aggregate = await aggregateMonth(tenantId, monthStart);
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
          grandTotalSales: Number(tenant.grandTotalSales || 0),
          grandTotalRegister: formatGrandTotalRegister(Number(tenant.grandTotalSales || 0)),
          generatedAt: new Date().toISOString(),
        };

        const fileName = `${tenant.slug}-${options.period}-${aggregate.startDate.toISOString().split('T')[0]}.json`;
        await fs.writeFile(path.join(exportDir, fileName), JSON.stringify(payload, null, 2), 'utf-8');

        // Push to tenant-configured endpoint, if any (best-effort — local file is the source of truth).
        const tenantSettings = tenant.settings as { birEsalesPushUrl?: string } | null;
        const pushUrl = tenantSettings?.birEsalesPushUrl;
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
