import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import { isRefundRecord, SALE_AND_REFUND_STATUSES } from '@/lib/refund-plan';
import { DEFAULT_TENANT_TIMEZONE, getTenantDayBoundaries } from '@/lib/timezone';

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

/** Midnight of a business day in the store's timezone. Pass a day as 'YYYY-MM-DD' to name it exactly. */
export function startOfBusinessDay(date: Date | string, timezone: string = DEFAULT_TENANT_TIMEZONE): Date {
  return getTenantDayBoundaries(date, timezone).start;
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
  businessDate: Date | string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): Promise<DailySalesAggregate> {
  const { start: startDate, end: lastInstant } = getTenantDayBoundaries(businessDate, timezone);
  const endDate = new Date(lastInstant.getTime() + 1);

  const [transactions, voided] = await Promise.all([
    Transaction.find({
      tenantId,
      status: { $in: SALE_AND_REFUND_STATUSES },
      createdAt: { $gte: startDate, $lt: endDate },
    })
      .select('total discountAmount taxAmount taxExemptAmount zeroRatedAmount status receiptNumber')
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
    grossSales += tx.total;
    vatAmount += tx.taxAmount ?? 0;
    vatExemptSales += tx.taxExemptAmount ?? 0;
    zeroRatedSales += tx.zeroRatedAmount ?? 0;
    discountTotal += tx.discountAmount ?? 0;
  }

  // What was charged less VAT, exempt and zero-rated sales. Works off the total because that holds
  // for VAT-inclusive and VAT-exclusive prices alike, and the four lines always add up to gross sales.
  const vatableSales = Math.max(0, grossSales - vatAmount - vatExemptSales - zeroRatedSales);

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

/**
 * The Grand Total as it stood when a business day ended, worked back from the live figure.
 * A reading made after midnight would otherwise take in the new day's sales. Only sales rung
 * up by a cashier count, as manual and channel sales have no userId and never reach the Grand
 * Total. Voided sales do count, since voiding doesn't take them back off.
 */
export async function getGrandTotalAtDayEnd(
  tenantId: string | mongoose.Types.ObjectId,
  dayEnd: Date,
  currentGrandTotal: number,
  readAt: Date
): Promise<number> {
  if (readAt <= dayEnd) return currentGrandTotal;

  const laterSales = await Transaction.find({
    tenantId,
    userId: { $exists: true },
    createdAt: { $gt: dayEnd, $lt: readAt },
  })
    .select('total status receiptNumber')
    .lean();

  const gained = laterSales.reduce((sum, tx) => (isRefundRecord(tx) ? sum : sum + tx.total), 0);
  return Math.max(0, roundMoney(currentGrandTotal - gained));
}
