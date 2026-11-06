import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFind = vi.fn();
const mockCount = vi.fn();
vi.mock('@/models/Transaction', () => ({
  default: {
    find: (...args: unknown[]) => mockFind(...args),
    countDocuments: (...args: unknown[]) => mockCount(...args),
  },
}));

import { getDailySalesAggregate } from '@/lib/bir-readings';

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

  it('goes negative when refunds exceed sales, leaving sale figures at zero', async () => {
    dayRows([{ status: 'refunded', receiptNumber: 'REF-OLD', subtotal: 100, taxAmount: 12, total: 112 }]);

    const result = await getDailySalesAggregate('tenant-a', new Date('2026-11-01'));

    expect(result).toMatchObject({ grossSales: 0, vatAmount: 0, vatableSales: 0, netSales: -112 });
  });
});
