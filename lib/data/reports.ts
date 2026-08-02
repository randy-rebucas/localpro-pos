import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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
    vatAmount += Number(tx.taxAmount ?? 0);
    vatExemptSales += Number(tx.taxExemptAmount ?? 0);
    zeroRatedSales += Number(tx.zeroRatedAmount ?? 0);
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

export function serializeZReading(z: {
  id: string;
  beginningGT: Prisma.Decimal;
  endingGT: Prisma.Decimal;
  grossSales: Prisma.Decimal;
  vatableSales: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  vatExemptSales: Prisma.Decimal;
  zeroRatedSales: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  generatedBy: string;
  generatedByUser?: { name: string; email: string } | null;
  [key: string]: unknown;
}) {
  const { id, generatedByUser, generatedBy, ...rest } = z;
  return {
    _id: id,
    ...rest,
    beginningGT: Number(z.beginningGT),
    endingGT: Number(z.endingGT),
    grossSales: Number(z.grossSales),
    vatableSales: Number(z.vatableSales),
    vatAmount: Number(z.vatAmount),
    vatExemptSales: Number(z.vatExemptSales),
    zeroRatedSales: Number(z.zeroRatedSales),
    discountTotal: Number(z.discountTotal),
    generatedBy: generatedByUser
      ? { _id: generatedBy, name: generatedByUser.name, email: generatedByUser.email }
      : generatedBy,
  };
}
