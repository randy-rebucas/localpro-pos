process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/models/Product', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

vi.mock('@/models/ProductBundle', () => ({
  default: { findOne: vi.fn() },
}));

vi.mock('@/models/StockMovement', () => ({
  default: {
    create: vi.fn().mockResolvedValue(undefined),
    insertMany: vi.fn().mockResolvedValue(undefined),
  },
}));

import Product from '@/models/Product';
import StockMovement from '@/models/StockMovement';
import {
  computeProductStock,
  getLowStockProducts,
  updateStock,
  insertStockMovements,
  type StockMovementInput,
  type StockProductSnapshot,
} from '@/lib/stock';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ProductMock = Product as any;
const StockMovementMock = StockMovement as any;

/** Product.findOne(...).select(...).lean() chain resolving to `doc`. */
function findOneChain(doc: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(doc),
    }),
  };
}

/** Product.findOneAndUpdate(...).lean() chain resolving to `doc`. */
function findOneAndUpdateChain(doc: unknown) {
  return { lean: vi.fn().mockResolvedValue(doc) };
}

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

  it('uses the snapshot (no findOne) and applies a guarded $inc on master stock', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 8 }));

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, allowOutOfStockSales: false, stock: 10 },
      transactionId: 'tx1',
    });

    expect(ProductMock.findOne).not.toHaveBeenCalled();
    expect(ProductMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'p1', tenantId: 't1', stock: { $gte: 2 } });
    expect(update).toEqual({ $inc: { stock: -2 } });
    expect(opts.new).toBe(true);
  });

  it('omits the stock guard when allowOutOfStockSales is true', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: -1 }));

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, allowOutOfStockSales: true, stock: 1 },
    });

    const [filter, update] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'p1', tenantId: 't1' });
    expect(filter).not.toHaveProperty('stock');
    expect(update).toEqual({ $inc: { stock: -2 } });
  });

  it('omits the stock guard for positive quantities', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 15 }));

    await updateStock('p1', 't1', 5, 'purchase', {
      product: { trackInventory: true, stock: 10 },
    });

    const [filter] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'p1', tenantId: 't1' });
  });

  it('loads the product via findOne when no snapshot is passed', async () => {
    ProductMock.findOne.mockReturnValue(findOneChain({ trackInventory: true, stock: 10 }));
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 9 }));

    await updateStock('p1', 't1', -1, 'sale');

    expect(ProductMock.findOne).toHaveBeenCalledWith({ _id: 'p1', tenantId: 't1' });
    expect(ProductMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('throws Product not found when findOne returns null', async () => {
    ProductMock.findOne.mockReturnValue(findOneChain(null));
    await expect(updateStock('p1', 't1', -1, 'sale')).rejects.toThrow('Product not found');
    expect(ProductMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses $elemMatch and positional $inc for variations', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(
      findOneAndUpdateChain({ variations: [{ _id: 'v1', stock: 1 }, { _id: 'v2', stock: 5 }] })
    );
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

    const [filter, update] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: 'p1',
      tenantId: 't1',
      variations: { $elemMatch: { _id: 'v1', stock: { $gte: 3 } } },
    });
    expect(update).toEqual({ $inc: { 'variations.$.stock': -3 } });
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
    expect(ProductMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('uses $elemMatch and positional $inc for an existing branch entry', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(
      findOneAndUpdateChain({ branchStock: [{ branchId: 'b1', stock: 6 }] })
    );
    const movements: StockMovementInput[] = [];

    await updateStock('p1', 't1', -4, 'sale', {
      product: { trackInventory: true, branchStock: [{ branchId: 'b1', stock: 10 }] },
      branchId: 'b1',
      movements,
    });

    const [filter, update] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: 'p1',
      tenantId: 't1',
      branchStock: { $elemMatch: { branchId: 'b1', stock: { $gte: 4 } } },
    });
    expect(update).toEqual({ $inc: { 'branchStock.$.stock': -4 } });
    expect(movements[0]).toMatchObject({ branchId: 'b1', previousStock: 10, newStock: 6 });
  });

  it('pushes a new branch entry when the branch is missing', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(
      findOneAndUpdateChain({ branchStock: [{ branchId: 'b2', stock: 5 }] })
    );

    await updateStock('p1', 't1', 5, 'purchase', {
      product: { trackInventory: true, branchStock: [] },
      branchId: 'b2',
      movements: [],
    });

    const [filter, update] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'p1', tenantId: 't1', 'branchStock.branchId': { $ne: 'b2' } });
    expect(update).toEqual({ $push: { branchStock: { branchId: 'b2', stock: 5 } } });
  });

  it('throws Insufficient stock with the fresh available amount when the guard fails (no snapshot)', async () => {
    ProductMock.findOne
      .mockReturnValueOnce(findOneChain({ trackInventory: true, stock: 5 }))
      .mockReturnValueOnce(findOneChain({ trackInventory: true, stock: 1 }));
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain(null));

    await expect(updateStock('p1', 't1', -3, 'sale')).rejects.toThrow(
      'Insufficient stock. Available: 1, Requested: 3'
    );
    expect(ProductMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(StockMovementMock.create).not.toHaveBeenCalled();
  });

  it('throws Product not found when the fresh re-read finds nothing', async () => {
    ProductMock.findOne
      .mockReturnValueOnce(findOneChain({ trackInventory: true, stock: 5 }))
      .mockReturnValueOnce(findOneChain(null));
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain(null));

    await expect(updateStock('p1', 't1', -3, 'sale')).rejects.toThrow('Product not found');
  });

  it('does not retry when a plain stock guard fails (genuinely insufficient)', async () => {
    ProductMock.findOne.mockReturnValueOnce(findOneChain({ trackInventory: true, stock: 1 }));
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain(null));

    await expect(
      updateStock('p1', 't1', -3, 'sale', { product: { trackInventory: true, stock: 10 } })
    ).rejects.toThrow('Insufficient stock. Available: 1, Requested: 3');
    expect(ProductMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(ProductMock.findOne).toHaveBeenCalledTimes(1);
  });

  it('retries with the fresh product when the branch entry was created meanwhile', async () => {
    const fresh = { trackInventory: true, branchStock: [{ branchId: 'b1', stock: 5 }] };
    ProductMock.findOne.mockReturnValueOnce(findOneChain(fresh));
    ProductMock.findOneAndUpdate
      .mockReturnValueOnce(findOneAndUpdateChain(null)) // $push lost the race
      .mockReturnValueOnce(findOneAndUpdateChain({ branchStock: [{ branchId: 'b1', stock: 8 }] }));

    await updateStock('p1', 't1', 3, 'purchase', {
      branchId: 'b1',
      product: { trackInventory: true, branchStock: [] },
    });
    expect(ProductMock.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(ProductMock.findOneAndUpdate.mock.calls[1][1]).toEqual({ $inc: { 'branchStock.$.stock': 3 } });
  });

  it('refuses to create a negative branch entry when out-of-stock sales are not allowed', async () => {
    await expect(
      updateStock('p1', 't1', -2, 'sale', { branchId: 'b1', product: { trackInventory: true, branchStock: [] } })
    ).rejects.toThrow('Insufficient stock at branch. Available: 0, Requested: 2');
    expect(ProductMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('creates a movement record with previousStock = newStock - quantity and transactionId', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 8 }));

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, stock: 10 },
      transactionId: 'tx1',
      userId: 'u1',
      reason: 'Sale',
    });

    expect(StockMovementMock.create).toHaveBeenCalledTimes(1);
    expect(StockMovementMock.create).toHaveBeenCalledWith(
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
      })
    );
  });

  it('passes the session to StockMovement.create as an array call', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 8 }));
    const session = {} as any;

    await updateStock('p1', 't1', -2, 'sale', { product: { trackInventory: true, stock: 10 } }, session);

    const [, , opts] = ProductMock.findOneAndUpdate.mock.calls[0];
    expect(opts.session).toBe(session);
    expect(StockMovementMock.create).toHaveBeenCalledWith(
      [expect.objectContaining({ previousStock: 10, newStock: 8 })],
      { session }
    );
  });

  it('pushes into options.movements instead of calling StockMovement.create', async () => {
    ProductMock.findOneAndUpdate.mockReturnValue(findOneAndUpdateChain({ stock: 8 }));
    const movements: StockMovementInput[] = [];

    await updateStock('p1', 't1', -2, 'sale', {
      product: { trackInventory: true, stock: 10 },
      transactionId: 'tx1',
      movements,
    });

    expect(StockMovementMock.create).not.toHaveBeenCalled();
    expect(movements).toEqual([
      expect.objectContaining({ previousStock: 10, newStock: 8, transactionId: 'tx1', quantity: -2 }),
    ]);
  });

  it('skips the update entirely when trackInventory is false', async () => {
    await updateStock('p1', 't1', -2, 'sale', { product: { trackInventory: false, stock: 0 } });

    expect(ProductMock.findOne).not.toHaveBeenCalled();
    expect(ProductMock.findOneAndUpdate).not.toHaveBeenCalled();
    expect(StockMovementMock.create).not.toHaveBeenCalled();
  });
});

describe('insertStockMovements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing for an empty array', async () => {
    await insertStockMovements([]);
    expect(StockMovementMock.insertMany).not.toHaveBeenCalled();
  });

  it('inserts all movements in one call', async () => {
    const m: StockMovementInput = {
      productId: 'p1',
      tenantId: 't1',
      type: 'sale',
      quantity: -1,
      previousStock: 2,
      newStock: 1,
    };
    await insertStockMovements([m, m]);
    expect(StockMovementMock.insertMany).toHaveBeenCalledTimes(1);
    expect(StockMovementMock.insertMany).toHaveBeenCalledWith([m, m], {});
  });

  it('forwards the session', async () => {
    const session = {} as any;
    const m: StockMovementInput = {
      productId: 'p1',
      tenantId: 't1',
      type: 'sale',
      quantity: -1,
      previousStock: 2,
      newStock: 1,
    };
    await insertStockMovements([m], session);
    expect(StockMovementMock.insertMany).toHaveBeenCalledWith([m], { session });
  });
});

describe('getLowStockProducts', () => {
  const products = [
    { _id: 'out', name: 'Out', stock: 0, lowStockThreshold: 5 },
    { _id: 'few', name: 'Few', stock: 3, lowStockThreshold: 5 },
    { _id: 'unset', name: 'Unset', stock: 8, lowStockThreshold: 0 },
    { _id: 'plenty', name: 'Plenty', stock: 50, lowStockThreshold: 5 },
  ];

  beforeEach(() => {
    ProductMock.find.mockReset();
    ProductMock.find.mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(products) }),
    });
  });

  it('treats a threshold of 0 as out of stock only, not as unset', async () => {
    const result = await getLowStockProducts('tenant-1', undefined, 0);

    expect(result.map((p) => p._id)).toEqual(['out']);
    expect(result[0].threshold).toBe(0);
    expect(ProductMock.find.mock.calls[0][0].$or[1].$expr.$lte[1]).toBe(0);
  });

  it('uses each product threshold, and 10 for an unset one, when none is passed', async () => {
    const result = await getLowStockProducts('tenant-1');

    expect(result.map((p) => [p._id, p.threshold])).toEqual([['out', 5], ['few', 5], ['unset', 10]]);
  });

  it("uses the store's threshold only for products without their own", async () => {
    // Store setting 0 = "only when out of stock": products with their own 5 keep it
    const result = await getLowStockProducts('tenant-1', undefined, undefined, 0);

    expect(result.map((p) => [p._id, p.threshold])).toEqual([['out', 5], ['few', 5]]);
  });

  it('reports the lowest low variation, even when it is 0', async () => {
    ProductMock.find.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'v', name: 'Shirt', hasVariations: true, lowStockThreshold: 5, variations: [{ stock: 0 }, { stock: 4 }, { stock: 50 }] }]),
      }),
    });
    const result = await getLowStockProducts('tenant-1');
    expect(result[0].currentStock).toBe(0);
  });
});
