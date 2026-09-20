/**
 * Sales Reporting Aggregation
 *
 * Rolls up completed transactions into the daily/monthly/product/branch/cashier
 * summary tables (see prisma/schema.prisma "Reporting summary tables" section).
 * Dashboards and reports should read from those summary tables instead of
 * aggregating raw Transaction/TransactionItem rows on every request, so the
 * transactional tables stay free of heavy analytical read load.
 */

import prisma from '@/lib/db';
import { randomUUID } from 'crypto';
import { AutomationResult } from './types';

interface Bucket {
  transactionCount: number;
  itemCount: number;
  grossSales: number;
  discountTotal: number;
  taxTotal: number;
  netSales: number;
}

function emptyBucket(): Bucket {
  return { transactionCount: 0, itemCount: 0, grossSales: 0, discountTotal: 0, taxTotal: 0, netSales: 0 };
}

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Prisma composite unique inputs require non-null values for every field
 * (Postgres treats NULL != NULL, so a nullable branchId can't be looked up
 * via the compound unique key — see the idempotencyKey/channelSyncKey note
 * on the Transaction model). Find-then-write instead, so a null branchId
 * (the tenant-wide row) still updates in place rather than duplicating.
 */
async function upsertByLookup<T>(
  findFirst: () => Promise<{ id: string } | null>,
  create: (id: string) => Promise<T>,
  update: (id: string) => Promise<T>
): Promise<T> {
  const existing = await findFirst();
  return existing ? update(existing.id) : create(randomUUID());
}

export interface SalesReportingAggregationOptions {
  tenantId?: string;
  /** Day to aggregate (defaults to yesterday, UTC). */
  date?: Date;
}

/**
 * Aggregate one UTC day of completed transactions into DailySalesSummary,
 * ProductSalesSummary, BranchSalesSummary and CashierSalesSummary.
 */
export async function aggregateDailySalesSummary(
  options: SalesReportingAggregationOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = { success: true, message: '', processed: 0, failed: 0, errors: [] };

  const targetDate = dateOnly(options.date ?? new Date(Date.now() - 24 * 60 * 60 * 1000));
  const rangeStart = targetDate;
  const rangeEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

  let tenants;
  if (options.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
    tenants = tenant ? [tenant] : [];
  } else {
    tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  }

  for (const tenant of tenants) {
    try {
      const tenantId = tenant.id;
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId,
          status: 'completed',
          createdAt: { gte: rangeStart, lt: rangeEnd },
        },
        include: { items: true },
      });

      // tenant-wide + per-branch buckets
      const overall = emptyBucket();
      const byBranch = new Map<string, Bucket & { branchId: string | null }>();
      const byCashier = new Map<string, Bucket & { userId: string; branchId: string | null }>();
      const byProduct = new Map<string, { branchId: string | null; productId: string; quantitySold: number; grossSales: number; netSales: number }>();

      for (const tx of transactions) {
        const gross = Number(tx.subtotal);
        const discount = Number(tx.discountAmount ?? 0);
        const tax = Number(tx.taxAmount ?? 0);
        const net = Number(tx.total);
        const itemCount = tx.items.length;

        overall.transactionCount += 1;
        overall.itemCount += itemCount;
        overall.grossSales += gross;
        overall.discountTotal += discount;
        overall.taxTotal += tax;
        overall.netSales += net;

        const branchKey = tx.branchId ?? '__none__';
        const branchBucket = byBranch.get(branchKey) ?? { ...emptyBucket(), branchId: tx.branchId };
        branchBucket.transactionCount += 1;
        branchBucket.itemCount += itemCount;
        branchBucket.grossSales += gross;
        branchBucket.discountTotal += discount;
        branchBucket.taxTotal += tax;
        branchBucket.netSales += net;
        byBranch.set(branchKey, branchBucket);

        if (tx.userId) {
          const cashierKey = `${tx.userId}::${branchKey}`;
          const cashierBucket = byCashier.get(cashierKey) ?? { ...emptyBucket(), userId: tx.userId, branchId: tx.branchId };
          cashierBucket.transactionCount += 1;
          cashierBucket.itemCount += itemCount;
          cashierBucket.grossSales += gross;
          cashierBucket.discountTotal += discount;
          cashierBucket.taxTotal += tax;
          cashierBucket.netSales += net;
          byCashier.set(cashierKey, cashierBucket);
        }

        for (const item of tx.items) {
          if (!item.productId) continue;
          const productKey = `${item.productId}::${branchKey}`;
          const productBucket = byProduct.get(productKey) ?? {
            branchId: tx.branchId,
            productId: item.productId,
            quantitySold: 0,
            grossSales: 0,
            netSales: 0,
          };
          productBucket.quantitySold += item.quantity;
          productBucket.grossSales += Number(item.subtotal);
          const shareOfNet = gross > 0 ? (Number(item.subtotal) / gross) * net : 0;
          productBucket.netSales += shareOfNet;
          byProduct.set(productKey, productBucket);
        }
      }

      // Tenant-wide row (branchId: null) plus one row per real branch. Any
      // bucket for transactions with no branch assigned also has branchId
      // null, which would collide with the tenant-wide row's key — drop it
      // here since `overall` already includes those transactions in the
      // tenant-wide total.
      const dailyRows = [
        { branchId: null as string | null, bucket: overall },
        ...Array.from(byBranch.values())
          .filter((b) => b.branchId !== null)
          .map((b) => ({ branchId: b.branchId, bucket: b })),
      ];

      for (const row of dailyRows) {
        const data = {
          transactionCount: row.bucket.transactionCount,
          itemCount: row.bucket.itemCount,
          grossSales: row.bucket.grossSales,
          discountTotal: row.bucket.discountTotal,
          taxTotal: row.bucket.taxTotal,
          netSales: row.bucket.netSales,
        };
        await upsertByLookup(
          () => prisma.dailySalesSummary.findFirst({ where: { tenantId, branchId: row.branchId, date: targetDate } }),
          (id) => prisma.dailySalesSummary.create({ data: { id, tenantId, branchId: row.branchId, date: targetDate, ...data } }),
          (id) => prisma.dailySalesSummary.update({ where: { id }, data })
        );
      }

      for (const branchBucket of byBranch.values()) {
        if (!branchBucket.branchId) continue; // BranchSalesSummary requires a branchId
        await prisma.branchSalesSummary.upsert({
          where: { tenantId_branchId_date: { tenantId, branchId: branchBucket.branchId, date: targetDate } },
          create: {
            id: randomUUID(),
            tenantId,
            branchId: branchBucket.branchId,
            date: targetDate,
            transactionCount: branchBucket.transactionCount,
            grossSales: branchBucket.grossSales,
            netSales: branchBucket.netSales,
          },
          update: {
            transactionCount: branchBucket.transactionCount,
            grossSales: branchBucket.grossSales,
            netSales: branchBucket.netSales,
          },
        });
      }

      for (const cashierBucket of byCashier.values()) {
        const data = {
          transactionCount: cashierBucket.transactionCount,
          grossSales: cashierBucket.grossSales,
          netSales: cashierBucket.netSales,
        };
        await upsertByLookup(
          () => prisma.cashierSalesSummary.findFirst({
            where: { tenantId, userId: cashierBucket.userId, branchId: cashierBucket.branchId, date: targetDate },
          }),
          (id) => prisma.cashierSalesSummary.create({
            data: { id, tenantId, userId: cashierBucket.userId, branchId: cashierBucket.branchId, date: targetDate, ...data },
          }),
          (id) => prisma.cashierSalesSummary.update({ where: { id }, data })
        );
      }

      for (const productBucket of byProduct.values()) {
        const data = {
          quantitySold: productBucket.quantitySold,
          grossSales: productBucket.grossSales,
          netSales: productBucket.netSales,
        };
        await upsertByLookup(
          () => prisma.productSalesSummary.findFirst({
            where: { tenantId, branchId: productBucket.branchId, productId: productBucket.productId, date: targetDate },
          }),
          (id) => prisma.productSalesSummary.create({
            data: { id, tenantId, branchId: productBucket.branchId, productId: productBucket.productId, date: targetDate, ...data },
          }),
          (id) => prisma.productSalesSummary.update({ where: { id }, data })
        );
      }

      results.processed += 1;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      results.failed += 1;
      results.errors?.push(`Tenant ${tenant.id}: ${error.message}`);
    }
  }

  results.message = `Daily sales aggregation for ${targetDate.toISOString().slice(0, 10)}: ${results.processed} tenant(s) processed, ${results.failed} failed`;
  results.success = results.failed === 0;
  return results;
}

export interface MonthlySalesAggregationOptions {
  tenantId?: string;
  /** Year/month to aggregate (defaults to the previous UTC month). */
  year?: number;
  month?: number; // 1-12
}

/**
 * Roll DailySalesSummary rows up into MonthlySalesSummary for a given month.
 * Intended to run after all of that month's DailySalesSummary rows exist.
 */
export async function aggregateMonthlySalesSummary(
  options: MonthlySalesAggregationOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = { success: true, message: '', processed: 0, failed: 0, errors: [] };

  const now = new Date();
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = options.year ?? prevMonthDate.getUTCFullYear();
  const month = options.month ?? prevMonthDate.getUTCMonth() + 1; // 1-12

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  let tenants;
  if (options.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
    tenants = tenant ? [tenant] : [];
  } else {
    tenants = await prisma.tenant.findMany({ where: { isActive: true } });
  }

  for (const tenant of tenants) {
    try {
      const tenantId = tenant.id;
      const dailyRows = await prisma.dailySalesSummary.findMany({
        where: { tenantId, date: { gte: monthStart, lt: monthEnd } },
      });

      const byBranch = new Map<string, Bucket & { branchId: string | null }>();
      for (const row of dailyRows) {
        const key = row.branchId ?? '__none__';
        const bucket = byBranch.get(key) ?? { ...emptyBucket(), branchId: row.branchId };
        bucket.transactionCount += row.transactionCount;
        bucket.itemCount += row.itemCount;
        bucket.grossSales += Number(row.grossSales);
        bucket.discountTotal += Number(row.discountTotal);
        bucket.taxTotal += Number(row.taxTotal);
        bucket.netSales += Number(row.netSales);
        byBranch.set(key, bucket);
      }

      for (const bucket of byBranch.values()) {
        const data = {
          transactionCount: bucket.transactionCount,
          itemCount: bucket.itemCount,
          grossSales: bucket.grossSales,
          discountTotal: bucket.discountTotal,
          taxTotal: bucket.taxTotal,
          netSales: bucket.netSales,
        };
        await upsertByLookup(
          () => prisma.monthlySalesSummary.findFirst({ where: { tenantId, branchId: bucket.branchId, year, month } }),
          (id) => prisma.monthlySalesSummary.create({ data: { id, tenantId, branchId: bucket.branchId, year, month, ...data } }),
          (id) => prisma.monthlySalesSummary.update({ where: { id }, data })
        );
      }

      results.processed += 1;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      results.failed += 1;
      results.errors?.push(`Tenant ${tenant.id}: ${error.message}`);
    }
  }

  results.message = `Monthly sales aggregation for ${year}-${String(month).padStart(2, '0')}: ${results.processed} tenant(s) processed, ${results.failed} failed`;
  results.success = results.failed === 0;
  return results;
}
