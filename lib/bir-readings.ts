import prisma from '@/lib/db';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

export interface DailySalesAggregate {
  startDate: Date;
  endDate: Date;
  grossSales: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  discountTotal: number;
  transactionCount: number;
  voidCount: number;
}

/**
 * Normalizes a date to the start of its business day *in the tenant's
 * timezone* (not the server's — Vercel runs UTC, so a naive server-local
 * midnight would bucket sales into the wrong calendar day for any
 * non-UTC tenant). Mirrors what the other report routes do via
 * `getTenantDayBoundaries`.
 */
export function startOfBusinessDay(date: Date, tz: string = DEFAULT_TENANT_TIMEZONE): Date {
  return getTenantDayBoundaries(date, tz).start;
}

/**
 * Aggregates completed-transaction sales for a tenant over one business day.
 * Used by both the X-Reading (non-persisted, repeatable) and Z-Reading
 * (persisted, once-per-day) reports so their totals stay consistent.
 */
export async function getDailySalesAggregate(
  tenantId: string,
  businessDate: Date,
  tz: string = DEFAULT_TENANT_TIMEZONE
): Promise<DailySalesAggregate> {
  const { start: startDate, end: inclusiveEnd } = getTenantDayBoundaries(businessDate, tz);
  const endDate = new Date(inclusiveEnd.getTime() + 1);

  const [completed, voided] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        tenantId,
        status: 'completed',
        createdAt: { gte: startDate, lt: endDate },
      },
      select: {
        subtotal: true,
        total: true,
        discountAmount: true,
        taxAmount: true,
        taxExemptAmount: true,
        zeroRatedAmount: true,
      },
    }),
    prisma.transaction.count({
      where: {
        tenantId,
        status: { in: ['cancelled', 'refunded'] },
        createdAt: { gte: startDate, lt: endDate },
      },
    }),
  ]);

  let grossSales = 0;
  let vatAmount = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let discountTotal = 0;
  let subtotalAfterDiscount = 0;

  for (const tx of completed) {
    const total = Number(tx.total);
    const subtotal = tx.subtotal != null ? Number(tx.subtotal) : total;
    const discountAmount = tx.discountAmount != null ? Number(tx.discountAmount) : 0;
    grossSales += total;
    vatAmount += tx.taxAmount != null ? Number(tx.taxAmount) : 0;
    vatExemptSales += tx.taxExemptAmount != null ? Number(tx.taxExemptAmount) : 0;
    zeroRatedSales += tx.zeroRatedAmount != null ? Number(tx.zeroRatedAmount) : 0;
    discountTotal += discountAmount;
    subtotalAfterDiscount += subtotal - discountAmount;
  }

  // VATable sales = the VAT-exclusive base (subtotal net of discount, exemptions, and zero-rated sales).
  const vatableSales = Math.max(0, subtotalAfterDiscount - vatExemptSales - zeroRatedSales - vatAmount);

  return {
    startDate,
    endDate,
    grossSales,
    vatableSales,
    vatAmount,
    vatExemptSales,
    zeroRatedSales,
    discountTotal,
    transactionCount: completed.length,
    voidCount: voided,
  };
}
