import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import { isRefundRecord, SALE_AND_REFUND_STATUSES } from '@/lib/refund-plan';

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
  refundCount: number;
  refundTotal: number;
  refundVatAmount: number;
  /** Gross sales less refunds paid today. Negative when refunds exceed sales. */
  netSales: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Normalizes a date to local midnight (start of business day). */
export function startOfBusinessDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregates a tenant's sales over one business day. Sale figures stay as sold,
 * including sales refunded later, so gross sales reconcile with the Grand Total,
 * which never goes down. Refunds paid that day are reported separately.
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

  const [transactions, voided] = await Promise.all([
    Transaction.find({
      tenantId,
      status: { $in: SALE_AND_REFUND_STATUSES },
      createdAt: { $gte: startDate, $lt: endDate },
    })
      .select('subtotal total discountAmount taxAmount taxExemptAmount zeroRatedAmount status receiptNumber')
      .lean(),
    Transaction.countDocuments({
      tenantId,
      status: 'cancelled',
      createdAt: { $gte: startDate, $lt: endDate },
    }),
  ]);

  let grossSales = 0;
  let vatAmount = 0;
  let vatExemptSales = 0;
  let zeroRatedSales = 0;
  let discountTotal = 0;
  let subtotalAfterDiscount = 0;
  let transactionCount = 0;
  let refundCount = 0;
  let refundTotal = 0;
  let refundVatAmount = 0;

  for (const tx of transactions) {
    if (isRefundRecord(tx)) {
      refundCount += 1;
      refundTotal += tx.total;
      refundVatAmount += tx.taxAmount ?? 0;
      continue;
    }
    transactionCount += 1;
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
    transactionCount,
    voidCount: voided,
    refundCount,
    refundTotal: roundMoney(refundTotal),
    refundVatAmount: roundMoney(refundVatAmount),
    netSales: roundMoney(grossSales - refundTotal),
  };
}
