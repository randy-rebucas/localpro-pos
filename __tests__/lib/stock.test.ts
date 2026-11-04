(process.env as Record<string, string>).NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const repos = vi.hoisted(() => ({
  products: { findById: vi.fn(), adjustStock: vi.fn() },
  bundles: { findById: vi.fn() },
  stockMovements: { createMany: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/lib/db', () => ({ getRepos: () => repos }));

import {
  computeProductStock,
  updateStock,
  insertStockMovements,
  STOCK_SNAPSHOT_FIELDS,
  type StockMovementInput,
  type StockProductSnapshot,
} from '@/lib/stock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const createMany = repos.stockMovements.createMany;
const { products } = repos;

/** adjustStock call `i`: [tenantId, id, target, quantity, opts]. */
const adjustCall = (i = 0) => products.adjustStock.mock.calls[i];

describe('computeProductStock', () => {
  it('returns 999999 when trackInventory is false', () => {
    expect(computeProductStock({ trackInventory: false, stock: 3 })).toBe(999999);
  });

  it('returns 999999 when trackInventory is undefined', () => {
    expect(computeProductStock({ stock: 3 })).toBe(999999);
  });

  const variationProduct: StockProductSnapshot = {
    trackInventory: true,
    hasVariations: true,
    stock: 100,
    variations: [
      { _id: 'v1', size: 'S', color: 'red', type: 'a', stock: 4 },
      { _id: 'v2', size: 'M', color: 'blue', type: 'b', stock: 7 },
    ],
  };

  it('returns the matching variation stock', () => {
    expect(
      computeProductStock(variationProduct, { variation: { size: 'M', color: 'blue', type: 'b' } })
    ).toBe(7);
  });

  it('treats unspecified size/color/type as wildcards', () => {
    expect(computeProductStock(variationProduct, { variation: { color: 'blue' } })).toBe(7);
    expect(computeProductStock(variationProduct, { variation: { size: 'S' } })).toBe(4);
    // Empty option matches the first variation
    expect(computeProductStock(variationProduct, { variation: {} })).toBe(4);
  });

  it('returns 0 when no variation matches', () => {
    expect(computeProductStock(variationProduct, { variation: { size: 'XL' } })).toBe(0);
  });

  it('returns 0 when the matching variation has no stock field', () => {
    const p: StockProductSnapshot = {
      trackInventory: true,
      hasVariations: true,
      variations: [{ _id: 'v1', size: 'S' }],
    };
    expect(computeProductStock(p, { variation: { size: 'S' } })).toBe(0);
  });

  it('ignores variations when no variation option is given (falls back to master)', () => {
    expect(computeProductStock(variationProduct)).toBe(100);
  });

  const branchProduct: StockProductSnapshot = {
    trackInventory: true,
    stock: 50,
    branchStock: [
      { branchId: { toString: () => 'b1' }, stock: 12 },
      { branchId: { toString: () => 'b2' }, stock: 0 },
    ],
  };

  it('returns branch stock for a known branch', () => {
    expect(computeProductStock(branchProduct, { branchId: 'b1' })).toBe(12);
    expect(computeProductStock(branchProduct, { branchId: 'b2' })).toBe(0);
  });

  it('returns 0 for an unknown branch', () => {
    expect(computeProductStock(branchProduct, { branchId: 'nope' })).toBe(0);
  });

  it('returns master stock when no branch requested', () => {
    expect(computeProductStock(branchProduct)).toBe(50);
  });

  it('returns 0 when master stock is missing', () => {
    expect(computeProductStock({ trackInventory: true })).toBe(0);
  });
});

describe('updateStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the snapshot (no read) and adjusts master stock without allowing negatives', async () => {
    products.adjustStock.mockResolvedValue({ stock: 8 });

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, allowOutOfStockSales: false, stock: 10 },
      transactionId: 'tx1',
    });

    expect(products.findById).not.toHaveBeenCalled();
    expect(products.adjustStock).toHaveBeenCalledTimes(1);
    expect(adjustCall()).toEqual(['t1', 'p1', { kind: 'master' }, -2, { allowNegative: false, tx: undefined }]);
  });

  it('allows negative stock when allowOutOfStockSales is true', async () => {
    products.adjustStock.mockResolvedValue({ stock: -1 });

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, allowOutOfStockSales: true, stock: 1 },
    });

    expect(adjustCall()[4]).toMatchObject({ allowNegative: true });
  });

  it('passes positive quantities through unchanged', async () => {
    products.adjustStock.mockResolvedValue({ stock: 15 });

    await updateStock('p1', 't1', 5, 'purchase', {
      product: { trackInventory: true, stock: 10 },
    });

    expect(adjustCall()).toEqual(['t1', 'p1', { kind: 'master' }, 5, { allowNegative: false, tx: undefined }]);
  });

  it('loads the product snapshot when none is passed', async () => {
    products.findById.mockResolvedValue({ trackInventory: true, stock: 10 });
    products.adjustStock.mockResolvedValue({ stock: 9 });

    await updateStock('p1', 't1', -1, 'sale');

    expect(products.findById).toHaveBeenCalledWith('t1', 'p1', { select: STOCK_SNAPSHOT_FIELDS, tx: undefined });
    expect(products.adjustStock).toHaveBeenCalledTimes(1);
  });

  it('throws Product not found when the product is missing', async () => {
    products.findById.mockResolvedValue(null);
    await expect(updateStock('p1', 't1', -1, 'sale')).rejects.toThrow('Product not found');
    expect(products.adjustStock).not.toHaveBeenCalled();
  });

  it('targets the matching variation by id', async () => {
    products.adjustStock.mockResolvedValue({ variations: [{ _id: 'v1', stock: 1 }, { _id: 'v2', stock: 5 }] });
    const movements: StockMovementInput[] = [];

    await updateStock('p1', 't1', -3, 'sale', {
      product: {
        trackInventory: true,
        hasVariations: true,
        variations: [
          { _id: 'v1', size: 'S', stock: 4 },
          { _id: 'v2', size: 'M', stock: 8 },
        ],
      },
      variation: { size: 'S' },
      movements,
    });

    expect(adjustCall()[2]).toEqual({ kind: 'variation', variationId: 'v1' });
    expect(adjustCall()[3]).toBe(-3);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ newStock: 1, previousStock: 4, quantity: -3 });
  });

  it('throws when the requested variation does not exist', async () => {
    await expect(
      updateStock('p1', 't1', -1, 'sale', {
        product: {
          trackInventory: true,
          hasVariations: true,
          variations: [{ _id: 'v1', size: 'S', stock: 4 }],
        },
        variation: { size: 'XL' },
      })
    ).rejects.toThrow('Product variation not found');
    expect(products.adjustStock).not.toHaveBeenCalled();
  });

  it('targets an existing branch entry', async () => {
    products.adjustStock.mockResolvedValue({ branchStock: [{ branchId: 'b1', stock: 6 }] });
    const movements: StockMovementInput[] = [];

    await updateStock('p1', 't1', -4, 'sale', {
      product: { trackInventory: true, branchStock: [{ branchId: 'b1', stock: 10 }] },
      branchId: 'b1',
      movements,
    });

    expect(adjustCall()[2]).toEqual({ kind: 'branch', branchId: 'b1' });
    expect(movements[0]).toMatchObject({ branchId: 'b1', previousStock: 10, newStock: 6 });
  });

  it('creates a new branch entry when the branch is missing', async () => {
    products.adjustStock.mockResolvedValue({ branchStock: [{ branchId: 'b2', stock: 5 }] });

    await updateStock('p1', 't1', 5, 'purchase', {
      product: { trackInventory: true, branchStock: [] },
      branchId: 'b2',
      movements: [],
    });

    expect(adjustCall()[2]).toEqual({ kind: 'newBranch', branchId: 'b2' });
    expect(adjustCall()[3]).toBe(5);
  });

  it('throws Insufficient stock with the fresh available amount when the adjustment is refused (no snapshot)', async () => {
    products.findById
      .mockResolvedValueOnce({ trackInventory: true, stock: 5 })
      .mockResolvedValueOnce({ trackInventory: true, stock: 1 });
    products.adjustStock.mockResolvedValue(null);

    await expect(updateStock('p1', 't1', -3, 'sale')).rejects.toThrow('Insufficient stock. Available: 1, Requested: 3');
    expect(products.adjustStock).toHaveBeenCalledTimes(1);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('throws Product not found when the fresh re-read finds nothing', async () => {
    products.findById.mockResolvedValueOnce({ trackInventory: true, stock: 5 }).mockResolvedValueOnce(null);
    products.adjustStock.mockResolvedValue(null);

    await expect(updateStock('p1', 't1', -3, 'sale')).rejects.toThrow('Product not found');
  });

  it('does not retry when a plain stock adjustment is refused (genuinely insufficient)', async () => {
    products.findById.mockResolvedValueOnce({ trackInventory: true, stock: 1 });
    products.adjustStock.mockResolvedValue(null);

    await expect(
      updateStock('p1', 't1', -3, 'sale', { product: { trackInventory: true, stock: 10 } })
    ).rejects.toThrow('Insufficient stock. Available: 1, Requested: 3');
    expect(products.adjustStock).toHaveBeenCalledTimes(1);
    expect(products.findById).toHaveBeenCalledTimes(1);
  });

  it('retries with the fresh product when the branch entry was created meanwhile', async () => {
    const fresh = { trackInventory: true, branchStock: [{ branchId: 'b1', stock: 5 }] };
    products.findById.mockResolvedValueOnce(fresh);
    products.adjustStock
      .mockResolvedValueOnce(null) // the new entry lost the race
      .mockResolvedValueOnce({ branchStock: [{ branchId: 'b1', stock: 8 }] });

    await updateStock('p1', 't1', 3, 'purchase', {
      branchId: 'b1',
      product: { trackInventory: true, branchStock: [] },
    });
    expect(products.adjustStock).toHaveBeenCalledTimes(2);
    expect(adjustCall(1)[2]).toEqual({ kind: 'branch', branchId: 'b1' });
  });

  it('refuses to create a negative branch entry when out-of-stock sales are not allowed', async () => {
    await expect(
      updateStock('p1', 't1', -2, 'sale', { branchId: 'b1', product: { trackInventory: true, branchStock: [] } })
    ).rejects.toThrow('Insufficient stock at branch. Available: 0, Requested: 2');
    expect(products.adjustStock).not.toHaveBeenCalled();
  });

  it('creates a movement record with previousStock = newStock - quantity and transactionId', async () => {
    products.adjustStock.mockResolvedValue({ stock: 8 });

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, stock: 10 },
      transactionId: 'tx1',
      userId: 'u1',
      reason: 'Sale',
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          productId: 'p1',
          tenantId: 't1',
          type: 'sale',
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          transactionId: 'tx1',
          userId: 'u1',
          reason: 'Sale',
        }),
      ],
      { tx: undefined }
    );
  });

  it('passes the transaction to adjustStock and the movement write', async () => {
    products.adjustStock.mockResolvedValue({ stock: 8 });
    const session = {} as any;
    const tx = { driver: 'mongo' as const, session };

    await updateStock('p1', 't1', -2, 'sale', { product: { trackInventory: true, stock: 10 } }, tx);

    expect(adjustCall()[4].tx).toBe(tx);
    expect(createMany).toHaveBeenCalledWith([expect.objectContaining({ previousStock: 10, newStock: 8 })], { tx });
  });

  it('pushes into options.movements instead of writing the movement', async () => {
    products.adjustStock.mockResolvedValue({ stock: 8 });
    const movements: StockMovementInput[] = [];

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, stock: 10 },
      transactionId: 'tx1',
      movements,
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(movements).toEqual([
      expect.objectContaining({ previousStock: 10, newStock: 8, transactionId: 'tx1', quantity: -2 }),
    ]);
  });

  it('skips the update entirely when trackInventory is false', async () => {
    await updateStock('p1', 't1', -2, 'sale', { product: { trackInventory: false, stock: 0 } });

    expect(products.findById).not.toHaveBeenCalled();
    expect(products.adjustStock).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('insertStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const m: StockMovementInput = {
    productId: 'p1',
    tenantId: 't1',
    type: 'sale',
    quantity: -1,
    previousStock: 2,
    newStock: 1,
  };

  it('inserts all movements in one call', async () => {
    await insertStockMovements([m, m]);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith([m, m], { tx: undefined });
  });

  it('forwards the transaction', async () => {
    const tx = { driver: 'mongo' as const, session: {} as any };
    await insertStockMovements([m], tx);
    expect(createMany).toHaveBeenCalledWith([m], { tx });
  });
});
