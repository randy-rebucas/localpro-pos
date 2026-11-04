import { getRepos } from '@/lib/db';

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

/** Normalizes a date to local midnight (start of business day). */
export function startOfBusinessDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregates completed-transaction sales for a tenant over one business day.
 * Used by both the X-Reading (non-persisted, repeatable) and Z-Reading
 * (persisted, once-per-day) reports so their totals stay consistent.
 */
export async function getDailySalesAggregate(
  tenantId: string,
  businessDate: Date
): Promise<DailySalesAggregate> {
  const startDate = startOfBusinessDay(businessDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const { transactions } = getRepos();
  const createdAt = { gte: startDate, lt: endDate };
  const [completed, voided] = await Promise.all([
    transactions.list(
      tenantId,
      { status: 'completed', createdAt },
      { select: 'subtotal total discountAmount taxAmount taxExemptAmount zeroRatedAmount' }
    ),
    transactions.count(tenantId, { status: ['cancelled', 'refunded'], createdAt }),
  ]);

  let grossSales = 0;
  let vatAmount = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let discountTotal = 0;
  let subtotalAfterDiscount = 0;

  for (const tx of completed) {
    const subtotal = tx.subtotal ?? tx.total;
    const discountAmount = tx.discountAmount ?? 0;
    grossSales += tx.total;
    vatAmount += tx.taxAmount ?? 0;
    vatExemptSales += tx.taxExemptAmount ?? 0;
    zeroRatedSales += tx.zeroRatedAmount ?? 0;
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
