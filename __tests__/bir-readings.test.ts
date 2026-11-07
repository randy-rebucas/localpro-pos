import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFind = vi.fn();
const mockCount = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCount(...args),
  },
}));

import { getDailySalesAggregate, getGrandTotalAtDayEnd, startOfBusinessDay } from '@/lib/bir-readings';

const dayRows = (rows: Array<Record<string, unknown>>) =>
  mockFind.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }) });

describe('getDailySalesAggregate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(1);
  });

  it('keeps sales as sold and reports refunds beside them', async () => {
    dayRows([
      { status: 'refunded', receiptNumber: 'R1', subtotal: 100, taxAmount: 12, total: 112 },
      { status: 'completed', receiptNumber: 'R2', subtotal: 200, taxAmount: 24, total: 224 },
      { status: 'refunded', receiptNumber: 'REF-R1', subtotal: 100, taxAmount: 12, total: 112 },
      { status: 'refunded', receiptNumber: 'REF-R2', subtotal: 50, taxAmount: 6, total: 56 },
    ]);

    const result = await getDailySalesAggregate('tenant-a', new Date('2026-11-01'));

    expect(result).toMatchObject({
      grossSales: 336,
      vatAmount: 36,
      transactionCount: 2,
      refundCount: 2,
      refundTotal: 168,
      refundVatAmount: 18,
      netSales: 168,
      voidCount: 1,
    });
  });

  it('counts only cancelled sales as voids, scoped to the tenant', async () => {
    dayRows([]);

    await getDailySalesAggregate('tenant-a', new Date('2026-11-01'));

    expect(mockCount.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', status: 'cancelled' });
    expect(mockFind.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a', status: { $in: ['completed', 'refunded'] } });
  });

  it('reports VATable sales when VAT was added on top of the price', async () => {
    dayRows([{ status: 'completed', receiptNumber: 'R1', subtotal: 1000, taxAmount: 120, total: 1120 }]);

    const result = await getDailySalesAggregate('tenant-a', '2026-11-01');

    expect(result).toMatchObject({ grossSales: 1120, vatableSales: 1000, vatAmount: 120 });
  });

  it('reports VATable sales when VAT was inside the price', async () => {
    dayRows([{ status: 'completed', receiptNumber: 'R1', subtotal: 1120, taxAmount: 120, total: 1120 }]);

    const result = await getDailySalesAggregate('tenant-a', '2026-11-01');

    expect(result).toMatchObject({ grossSales: 1120, vatableSales: 1000, vatAmount: 120 });
  });

  it('adds up to gross sales across taxed, exempt and zero-rated sales', async () => {
    dayRows([
      { status: 'completed', receiptNumber: 'R1', subtotal: 1000, taxAmount: 120, total: 1120 },
      { status: 'completed', receiptNumber: 'R2', subtotal: 100, discountAmount: 20, taxExemptAmount: 80, total: 80 },
      { status: 'completed', receiptNumber: 'R3', subtotal: 50, zeroRatedAmount: 50, total: 50 },
    ]);

    const { grossSales, vatableSales, vatAmount, vatExemptSales, zeroRatedSales } = await getDailySalesAggregate('tenant-a', '2026-11-01');

    expect(vatableSales + vatAmount + vatExemptSales + zeroRatedSales).toBe(grossSales);
  });

  it('covers midnight to midnight Manila time by default, wherever the server runs', async () => {
    dayRows([]);

    const result = await getDailySalesAggregate('tenant-a', '2026-11-07');

    expect(result.startDate).toEqual(new Date('2026-11-06T16:00:00.000Z'));
    expect(result.endDate).toEqual(new Date('2026-11-07T16:00:00.000Z'));
    expect(mockFind.mock.calls[0][0].createdAt).toEqual({ $gte: result.startDate, $lt: result.endDate });
  });

  it("follows the store's timezone when it has one", () => {
    expect(startOfBusinessDay('2026-11-10', 'America/New_York')).toEqual(new Date('2026-11-10T05:00:00.000Z'));
  });

  it('counts a 3am Manila sale in that calendar day, not the day before', () => {
    expect(startOfBusinessDay(new Date('2026-11-07T19:00:00.000Z'))).toEqual(new Date('2026-11-07T16:00:00.000Z'));
  });

  it('goes negative when refunds exceed sales, leaving sale figures at zero', async () => {
    dayRows([{ status: 'refunded', receiptNumber: 'REF-OLD', subtotal: 100, taxAmount: 12, total: 112 }]);

    const result = await getDailySalesAggregate('tenant-a', new Date('2026-11-01'));

    expect(result).toMatchObject({ grossSales: 0, vatAmount: 0, vatableSales: 0, netSales: -112 });
  });
});

describe('getGrandTotalAtDayEnd', () => {
  const dayEnd = new Date('2026-11-06T15:59:59.999Z');
  const readAt = new Date('2026-11-06T16:15:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('takes back sales made after the day ended, voided ones included, but not refund records', async () => {
    dayRows([
      { status: 'completed', receiptNumber: 'R10', total: 100 },
      { status: 'cancelled', receiptNumber: 'R11', total: 50 },
      { status: 'refunded', receiptNumber: 'R12', total: 25 },
      { status: 'refunded', receiptNumber: 'REF-R12', total: 25 },
    ]);

    await expect(getGrandTotalAtDayEnd('tenant-a', dayEnd, 1000, readAt)).resolves.toBe(825);
    expect(mockFind).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      userId: { $exists: true },
      createdAt: { $gt: dayEnd, $lt: readAt },
    });
  });

  it('uses the live figure while the day is still open', async () => {
    await expect(getGrandTotalAtDayEnd('tenant-a', dayEnd, 1000, new Date('2026-11-06T10:00:00.000Z'))).resolves.toBe(1000);
    expect(mockFind).not.toHaveBeenCalled();
  });
});
