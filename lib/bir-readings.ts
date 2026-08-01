import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';

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
  tenantId: string | mongoose.Types.ObjectId,
  businessDate: Date
): Promise<DailySalesAggregate> {
  const startDate = startOfBusinessDay(businessDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const [completed, voided] = await Promise.all([
    Transaction.find({
      tenantId,
      status: 'completed',
      createdAt: { $gte: startDate, $lt: endDate },
    })
      .select('subtotal total discountAmount taxAmount taxExemptAmount zeroRatedAmount')
      .lean(),
    Transaction.countDocuments({
      tenantId,
      status: { $in: ['cancelled', 'refunded'] },
      createdAt: { $gte: startDate, $lt: endDate },
    }),
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
