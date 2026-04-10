process.env.JWT_SECRET = 'test-secret-32chars!!';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/models/StockMovement', () => ({
  default: { create: vi.fn().mockResolvedValue({}) },
}));

const {
  mockProductFindOne,
  mockBundleFindOne,
  mockProductFind,
} = vi.hoisted(() => ({
  mockProductFindOne: vi.fn(),
  mockBundleFindOne: vi.fn(),
  mockProductFind: vi.fn(),
}));

vi.mock('@/models/Product', () => ({
  default: { findOne: mockProductFindOne, find: mockProductFind },
}));

vi.mock('@/models/ProductBundle', () => ({
  default: { findOne: mockBundleFindOne },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Mongoose document that supports .save(), .isModified(), .markModified() */
function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Widget',
    stock: 10,
    trackInventory: true,
    allowOutOfStockSales: false,
    hasVariations: false,
    variations: [],
    branchStock: [],
    isModified: vi.fn().mockReturnValue(false),
    markModified: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Returns a value that can be both directly awaited AND chained with .session().
 * Handles: `await Product.findOne(...)` and `Product.findOne(...).session(s)`.
 */
function makeQuery(value: unknown) {
  const p = Promise.resolve(value) as Promise<unknown> & { session: ReturnType<typeof vi.fn> };
  p.session = vi.fn().mockResolvedValue(value);
  return p;
}

// ---------------------------------------------------------------------------
// getProductStock
// ---------------------------------------------------------------------------

describe('getProductStock', () => {
  let getProductStock: typeof import('@/lib/stock').getProductStock;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ getProductStock } = await import('@/lib/stock'));
  });

  it('throws when product is not found', async () => {
    mockProductFindOne.mockResolvedValue(null);
    await expect(getProductStock('prod-x', 'tenant-1')).rejects.toThrow('Product not found');
  });

  it('returns 999999 when trackInventory is false', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ trackInventory: false }));
    expect(await getProductStock('prod-1', 'tenant-1')).toBe(999999);
  });

  it('returns master stock when no variations or branch', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ stock: 42 }));
    expect(await getProductStock('prod-1', 'tenant-1')).toBe(42);
  });

  it('returns variation stock when variation matches', async () => {
    const product = makeProduct({
      hasVariations: true,
      variations: [{ size: 'M', color: 'red', stock: 7 }],
    });
    mockProductFindOne.mockResolvedValue(product);
    expect(await getProductStock('prod-1', 'tenant-1', { variation: { size: 'M', color: 'red' } })).toBe(7);
  });

  it('returns 0 when variation not found', async () => {
    const product = makeProduct({
      hasVariations: true,
      variations: [{ size: 'L', stock: 5 }],
    });
    mockProductFindOne.mockResolvedValue(product);
    expect(await getProductStock('prod-1', 'tenant-1', { variation: { size: 'S' } })).toBe(0);
  });

  it('returns branch stock when branchId matches', async () => {
    const product = makeProduct({
      branchStock: [{ branchId: { toString: () => 'branch-1' }, stock: 15 }],
    });
    mockProductFindOne.mockResolvedValue(product);
    expect(await getProductStock('prod-1', 'tenant-1', { branchId: 'branch-1' })).toBe(15);
  });

  it('returns 0 when branchId has no stock entry', async () => {
    const product = makeProduct({
      branchStock: [{ branchId: { toString: () => 'branch-2' }, stock: 3 }],
    });
    mockProductFindOne.mockResolvedValue(product);
    expect(await getProductStock('prod-1', 'tenant-1', { branchId: 'branch-9' })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateStock — master stock
// ---------------------------------------------------------------------------

describe('updateStock — master stock', () => {
  let updateStock: typeof import('@/lib/stock').updateStock;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ updateStock } = await import('@/lib/stock'));
  });

  it('throws when product is not found', async () => {
    mockProductFindOne.mockReturnValue(makeQuery(null));
    await expect(updateStock('prod-x', 'tenant-1', -5, 'sale')).rejects.toThrow('Product not found');
  });

  it('skips update when trackInventory is false', async () => {
    const product = makeProduct({ trackInventory: false });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', -5, 'sale');
    expect(product.save).not.toHaveBeenCalled();
  });

  it('deducts master stock on sale', async () => {
    const product = makeProduct({ stock: 10 });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', -3, 'sale');
    expect(product.stock).toBe(7);
    expect(product.save).toHaveBeenCalled();
  });

  it('adds stock on return', async () => {
    const product = makeProduct({ stock: 5 });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', 4, 'return');
    expect(product.stock).toBe(9);
  });

  it('throws on insufficient stock when allowOutOfStockSales is false', async () => {
    const product = makeProduct({ stock: 2, allowOutOfStockSales: false });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await expect(updateStock('prod-1', 'tenant-1', -5, 'sale')).rejects.toThrow('Insufficient stock');
  });

  it('allows negative stock when allowOutOfStockSales is true', async () => {
    const product = makeProduct({ stock: 1, allowOutOfStockSales: true });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', -5, 'sale');
    expect(product.stock).toBe(-4);
  });

  it('creates a StockMovement record', async () => {
    const { default: StockMovement } = await import('@/models/StockMovement');
    const product = makeProduct({ stock: 10 });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', -2, 'sale', { reason: 'POS sale' });
    expect(StockMovement.create).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateStock — variations
// ---------------------------------------------------------------------------

describe('updateStock — variation stock', () => {
  let updateStock: typeof import('@/lib/stock').updateStock;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ updateStock } = await import('@/lib/stock'));
  });

  it('deducts variation stock', async () => {
    const product = makeProduct({
      hasVariations: true,
      variations: [{ size: 'M', stock: 8 }],
    });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await updateStock('prod-1', 'tenant-1', -3, 'sale', { variation: { size: 'M' } });
    expect(product.variations[0].stock).toBe(5);
  });

  it('throws when variation is not found', async () => {
    const product = makeProduct({
      hasVariations: true,
      variations: [{ size: 'L', stock: 5 }],
    });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await expect(updateStock('prod-1', 'tenant-1', -1, 'sale', { variation: { size: 'XS' } }))
      .rejects.toThrow('Product variation not found');
  });

  it('throws on insufficient variation stock', async () => {
    const product = makeProduct({
      hasVariations: true,
      allowOutOfStockSales: false,
      variations: [{ size: 'S', stock: 1 }],
    });
    mockProductFindOne.mockReturnValue(makeQuery(product));
    await expect(updateStock('prod-1', 'tenant-1', -5, 'sale', { variation: { size: 'S' } }))
      .rejects.toThrow('Insufficient stock for variation');
  });
});

// ---------------------------------------------------------------------------
// updateBundleStock
// ---------------------------------------------------------------------------

describe('updateBundleStock', () => {
  let updateBundleStock: typeof import('@/lib/stock').updateBundleStock;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ updateBundleStock } = await import('@/lib/stock'));
  });

  it('throws when bundle is not found', async () => {
    mockBundleFindOne.mockReturnValue(makeQuery(null));
    await expect(updateBundleStock('bundle-x', 'tenant-1', -1, 'sale')).rejects.toThrow('Bundle not found');
  });

  it('skips when bundle trackInventory is false', async () => {
    mockBundleFindOne.mockReturnValue(makeQuery({ trackInventory: false, items: [] }));
    await updateBundleStock('bundle-1', 'tenant-1', -1, 'sale');
    expect(mockProductFindOne).not.toHaveBeenCalled();
  });

  it('deducts stock for each bundle item multiplied by bundle quantity', async () => {
    const bundle = {
      trackInventory: true,
      name: 'Combo Pack',
      items: [
        { productId: { toString: () => 'prod-a' }, quantity: 2, variation: undefined },
        { productId: { toString: () => 'prod-b' }, quantity: 3, variation: undefined },
      ],
    };
    mockBundleFindOne.mockReturnValue(makeQuery(bundle));

    const productA = makeProduct({ _id: 'prod-a', stock: 20 });
    const productB = makeProduct({ _id: 'prod-b', stock: 30 });
    mockProductFindOne
      .mockReturnValueOnce(makeQuery(productA))
      .mockReturnValueOnce(makeQuery(productB));

    // Selling 2 bundles: productA needs 2×2=4, productB needs 3×2=6
    await updateBundleStock('bundle-1', 'tenant-1', -2, 'sale');

    expect(productA.stock).toBe(16); // 20 - 4
    expect(productB.stock).toBe(24); // 30 - 6
  });
});

// ---------------------------------------------------------------------------
// checkLowStock
// ---------------------------------------------------------------------------

describe('checkLowStock', () => {
  let checkLowStock: typeof import('@/lib/stock').checkLowStock;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ checkLowStock } = await import('@/lib/stock'));
  });

  it('returns false when product is not found', async () => {
    mockProductFindOne.mockResolvedValue(null);
    expect(await checkLowStock('prod-x', 'tenant-1')).toBe(false);
  });

  it('returns false when trackInventory is false', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ trackInventory: false }));
    expect(await checkLowStock('prod-1', 'tenant-1')).toBe(false);
  });

  it('returns true when stock is at or below threshold', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ stock: 5, lowStockThreshold: 10 }));
    expect(await checkLowStock('prod-1', 'tenant-1')).toBe(true);
  });

  it('returns false when stock is above threshold', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ stock: 50, lowStockThreshold: 10 }));
    expect(await checkLowStock('prod-1', 'tenant-1')).toBe(false);
  });

  it('uses custom threshold over product threshold', async () => {
    mockProductFindOne.mockResolvedValue(makeProduct({ stock: 15 }));
    // product.lowStockThreshold defaults to 10, but we pass 20
    expect(await checkLowStock('prod-1', 'tenant-1', 20)).toBe(true);
  });
});
