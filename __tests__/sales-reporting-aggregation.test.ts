process.env.JWT_SECRET = 'test-secret-for-sales-reporting-aggregation-32chars!';
process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted so we cannot reference module-level
// const variables inside them. Use vi.fn() directly and grab references via
// dynamic import inside beforeEach / tests. Never attach `.then` to a mock
// object — always use mockResolvedValue/mockReturnValue (see project memory
// on the vitest thenable OOM bug).
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  const client = {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    dailySalesSummary: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    monthlySalesSummary: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    branchSalesSummary: {
      upsert: vi.fn(),
    },
    cashierSalesSummary: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productSalesSummary: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return { default: client };
});

import prisma from '@/lib/db';
import {
  aggregateDailySalesSummary,
  aggregateMonthlySalesSummary,
} from '@/lib/automations/sales-reporting-aggregation';

const TENANT = { id: 'tenant-1', isActive: true };

function tx(overrides: Record<string, any> = {}) {
  return {
    id: 'tx-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    userId: 'user-1',
    subtotal: 100,
    discountAmount: 0,
    taxAmount: 12,
    total: 112,
    status: 'completed',
    createdAt: new Date('2026-09-19T10:00:00Z'),
    items: [
      { productId: 'product-1', quantity: 2, subtotal: 100 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.dailySalesSummary.findFirst as any).mockResolvedValue(null);
  (prisma.dailySalesSummary.create as any).mockResolvedValue({ id: 'daily-1' });
  (prisma.dailySalesSummary.update as any).mockResolvedValue({ id: 'daily-1' });
  (prisma.branchSalesSummary.upsert as any).mockResolvedValue({ id: 'branch-summary-1' });
  (prisma.cashierSalesSummary.findFirst as any).mockResolvedValue(null);
  (prisma.cashierSalesSummary.create as any).mockResolvedValue({ id: 'cashier-1' });
  (prisma.cashierSalesSummary.update as any).mockResolvedValue({ id: 'cashier-1' });
  (prisma.productSalesSummary.findFirst as any).mockResolvedValue(null);
  (prisma.productSalesSummary.create as any).mockResolvedValue({ id: 'product-summary-1' });
  (prisma.productSalesSummary.update as any).mockResolvedValue({ id: 'product-summary-1' });
  (prisma.monthlySalesSummary.findFirst as any).mockResolvedValue(null);
  (prisma.monthlySalesSummary.create as any).mockResolvedValue({ id: 'monthly-1' });
  (prisma.monthlySalesSummary.update as any).mockResolvedValue({ id: 'monthly-1' });
});

describe('aggregateDailySalesSummary', () => {
  it('rolls a single tenant-wide transaction up into daily/branch/cashier/product summaries', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([tx()]);

    const result = await aggregateDailySalesSummary({
      tenantId: 'tenant-1',
      date: new Date('2026-09-19T00:00:00Z'),
    });

    expect(result.success).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Tenant-wide row (branchId: null) + one per-branch row
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledTimes(2);
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          branchId: null,
          transactionCount: 1,
          itemCount: 1,
          grossSales: 100,
          taxTotal: 12,
          netSales: 112,
        }),
      })
    );
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: 'branch-1', grossSales: 100, netSales: 112 }),
      })
    );

    expect(prisma.branchSalesSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_branchId_date: { tenantId: 'tenant-1', branchId: 'branch-1', date: expect.any(Date) } },
        create: expect.objectContaining({ transactionCount: 1, grossSales: 100, netSales: 112 }),
      })
    );

    expect(prisma.cashierSalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', branchId: 'branch-1', grossSales: 100, netSales: 112 }),
      })
    );

    expect(prisma.productSalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'product-1',
          branchId: 'branch-1',
          quantitySold: 2,
          grossSales: 100,
          netSales: 112,
        }),
      })
    );
  });

  it('updates an existing daily summary row instead of creating a duplicate', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([tx()]);
    (prisma.dailySalesSummary.findFirst as any).mockResolvedValue({ id: 'existing-daily-row' });

    await aggregateDailySalesSummary({ tenantId: 'tenant-1', date: new Date('2026-09-19T00:00:00Z') });

    expect(prisma.dailySalesSummary.create).not.toHaveBeenCalled();
    expect(prisma.dailySalesSummary.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-daily-row' },
        data: expect.objectContaining({ transactionCount: 1, grossSales: 100 }),
      })
    );
  });

  it('sums multiple transactions across the same branch/cashier/product into one row each', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([
      tx({ id: 'tx-1', subtotal: 100, total: 112, items: [{ productId: 'product-1', quantity: 2, subtotal: 100 }] }),
      tx({ id: 'tx-2', subtotal: 50, taxAmount: 6, total: 56, items: [{ productId: 'product-1', quantity: 1, subtotal: 50 }] }),
    ]);

    await aggregateDailySalesSummary({ tenantId: 'tenant-1', date: new Date('2026-09-19T00:00:00Z') });

    // tenant-wide row should combine both transactions
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: null,
          transactionCount: 2,
          itemCount: 2,
          grossSales: 150,
          taxTotal: 18,
          netSales: 168,
        }),
      })
    );
    // One combined product summary row for the shared productId/branch
    expect(prisma.productSalesSummary.create).toHaveBeenCalledTimes(1);
    expect(prisma.productSalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantitySold: 3, grossSales: 150 }),
      })
    );
  });

  it('skips items with no productId and transactions with no userId for their respective breakdowns', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([
      tx({ userId: null, items: [{ productId: null, quantity: 1, subtotal: 100 }] }),
    ]);

    await aggregateDailySalesSummary({ tenantId: 'tenant-1', date: new Date('2026-09-19T00:00:00Z') });

    expect(prisma.cashierSalesSummary.create).not.toHaveBeenCalled();
    expect(prisma.productSalesSummary.create).not.toHaveBeenCalled();
    // Daily/branch rollups still happen regardless
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledTimes(2);
  });

  it('does not write a duplicate/colliding daily row for unbranched transactions', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([tx({ branchId: null })]);

    await aggregateDailySalesSummary({ tenantId: 'tenant-1', date: new Date('2026-09-19T00:00:00Z') });

    expect(prisma.branchSalesSummary.upsert).not.toHaveBeenCalled();
    // Only the tenant-wide daily row is written — the unbranched bucket also
    // keys to branchId: null, which would collide with (and corrupt) the
    // tenant-wide row's unique key, so it must not be written separately.
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledTimes(1);
    expect(prisma.dailySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: null, transactionCount: 1 }) })
    );
  });

  it('records a per-tenant failure without aborting other tenants', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue([TENANT, { id: 'tenant-2', isActive: true }]);
    (prisma.transaction.findMany as any)
      .mockRejectedValueOnce(new Error('db exploded'))
      .mockResolvedValueOnce([]);

    const result = await aggregateDailySalesSummary({ date: new Date('2026-09-19T00:00:00Z') });

    expect(result.success).toBe(false);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([expect.stringContaining('tenant-1: db exploded')]);
  });

  it('defaults to yesterday (UTC) when no date is given', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.transaction.findMany as any).mockResolvedValue([]);

    await aggregateDailySalesSummary({ tenantId: 'tenant-1' });

    const call = (prisma.transaction.findMany as any).mock.calls[0][0];
    const expectedStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expectedDateOnly = new Date(Date.UTC(expectedStart.getUTCFullYear(), expectedStart.getUTCMonth(), expectedStart.getUTCDate()));
    expect(call.where.createdAt.gte.toISOString()).toBe(expectedDateOnly.toISOString());
  });
});

describe('aggregateMonthlySalesSummary', () => {
  it('rolls daily summary rows up into a monthly summary per branch bucket', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.dailySalesSummary.findMany as any).mockResolvedValue([
      { branchId: 'branch-1', transactionCount: 1, itemCount: 2, grossSales: 100, discountTotal: 0, taxTotal: 12, netSales: 112 },
      { branchId: 'branch-1', transactionCount: 2, itemCount: 3, grossSales: 50, discountTotal: 5, taxTotal: 6, netSales: 51 },
      { branchId: null, transactionCount: 3, itemCount: 5, grossSales: 150, discountTotal: 5, taxTotal: 18, netSales: 163 },
    ]);

    const result = await aggregateMonthlySalesSummary({ tenantId: 'tenant-1', year: 2026, month: 9 });

    expect(result.success).toBe(true);
    expect(prisma.monthlySalesSummary.create).toHaveBeenCalledTimes(2);
    expect(prisma.monthlySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'branch-1',
          year: 2026,
          month: 9,
          transactionCount: 3,
          itemCount: 5,
          grossSales: 150,
          discountTotal: 5,
          taxTotal: 18,
          netSales: 163,
        }),
      })
    );
    expect(prisma.monthlySalesSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: null, transactionCount: 3, grossSales: 150 }),
      })
    );
  });

  it('updates an existing monthly summary row instead of creating a duplicate', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.dailySalesSummary.findMany as any).mockResolvedValue([
      { branchId: 'branch-1', transactionCount: 1, itemCount: 1, grossSales: 10, discountTotal: 0, taxTotal: 1, netSales: 11 },
    ]);
    (prisma.monthlySalesSummary.findFirst as any).mockResolvedValue({ id: 'existing-monthly-row' });

    await aggregateMonthlySalesSummary({ tenantId: 'tenant-1', year: 2026, month: 9 });

    expect(prisma.monthlySalesSummary.create).not.toHaveBeenCalled();
    expect(prisma.monthlySalesSummary.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-monthly-row' } })
    );
  });

  it('defaults to the previous UTC month when no year/month is given', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(TENANT);
    (prisma.dailySalesSummary.findMany as any).mockResolvedValue([]);

    await aggregateMonthlySalesSummary({ tenantId: 'tenant-1' });

    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const call = (prisma.dailySalesSummary.findMany as any).mock.calls[0][0];
    expect(call.where.date.gte.toISOString()).toBe(expected.toISOString());
  });
});
