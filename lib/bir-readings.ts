import mongoose from 'mongoose';
import Transaction from '@/models/Transaction';
import { DEFAULT_TENANT_TIMEZONE, addDaysToYmd, getTenantDayBoundaries, getTenantYmd } from '@/lib/timezone';

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

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The tenant-local calendar day ('YYYY-MM-DD') a Date or 'YYYY-MM-DD' string refers to. */
export function businessDayYmd(date: Date | string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  if (typeof date === 'string' && YMD_RE.test(date)) return date;
  return getTenantYmd(new Date(date), tz);
}

/**
 * Parses a request's business-date input. A 'YYYY-MM-DD' string is kept as a
 * tenant-local calendar day; any other value is parsed as an instant; a
 * missing value means "now". Returns null for an unparseable value.
 */
export function parseBusinessDateInput(input: unknown): Date | string | null {
  if (input === undefined || input === null || input === '') return new Date();
  if (typeof input === 'string' && YMD_RE.test(input)) return input;
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * UTC instant of 00:00 on the tenant-local business day containing `date`
 * (or of the given 'YYYY-MM-DD' calendar day). Server-clock independent:
 * Vercel runs in UTC, so plain setHours(0,0,0,0) would cut the Manila
 * business day at 08:00 local.
 */
export function startOfBusinessDay(date: Date | string, tz: string = DEFAULT_TENANT_TIMEZONE): Date {
  return getTenantDayBoundaries(businessDayYmd(date, tz), tz).start;
}

/** Half-open [start, end) UTC range of one tenant-local business day (end = next local midnight). */
export function getBusinessDayRange(
  date: Date | string,
  tz: string = DEFAULT_TENANT_TIMEZONE
): { start: Date; end: Date; ymd: string } {
  const ymd = businessDayYmd(date, tz);
  return {
    ymd,
    start: getTenantDayBoundaries(ymd, tz).start,
    end: getTenantDayBoundaries(addDaysToYmd(ymd, 1), tz).start,
  };
}

/**
 * Aggregates completed-transaction sales for a tenant over the half-open
 * range [startDate, endDate).
 */
export async function getSalesAggregateForRange(
  tenantId: string | mongoose.Types.ObjectId,
  startDate: Date,
  endDate: Date
): Promise<DailySalesAggregate> {
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

/**
 * Aggregates completed-transaction sales for a tenant over one business day —
 * the tenant-local calendar day [local 00:00, next local 00:00) in `tz`.
 * `businessDate` may be any instant within the day or a 'YYYY-MM-DD' string.
 * Used by both the X-Reading (non-persisted, repeatable) and Z-Reading
 * (persisted, once-per-day) reports so their totals stay consistent.
 */
export async function getDailySalesAggregate(
  tenantId: string | mongoose.Types.ObjectId,
  businessDate: Date | string,
  tz: string = DEFAULT_TENANT_TIMEZONE
): Promise<DailySalesAggregate> {
  const { start, end } = getBusinessDayRange(businessDate, tz);
  return getSalesAggregateForRange(tenantId, start, end);
}
