/**
 * Tests for the batched ecommerce paths (catalog sync, inventory push,
 * refund restock, paid-order import).
 *
 * Never attach `.then` to a mock object (vitest thenable OOM) — query chains
 * below end in `lean: vi.fn().mockResolvedValue(...)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/cache', () => ({
  cacheWrap: vi.fn((_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  CacheKeys: { tenantHasIntegrations: (id: string) => `tenant:integrations:${id}` },
  TTL: { DEFAULT: 60 },
}));
vi.mock('@/lib/stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock')>();
  return { ...actual, updateStock: vi.fn(), insertStockMovements: vi.fn() };
});

vi.mock('@/models/Product', () => ({
  default: { find: vi.fn(), insertMany: vi.fn(), bulkWrite: vi.fn() },
}));
vi.mock('@/models/ProductChannelListing', () => ({ default: { find: vi.fn(), bulkWrite: vi.fn() } }));
vi.mock('@/models/TenantEcommerceIntegration', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('@/models/Transaction', () => ({
  default: { findOne: vi.fn(), create: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock('@/models/Payment', () => ({ default: { create: vi.fn() } }));
vi.mock('@/models/Customer', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/lib/receipt', () => ({ generateReceiptNumber: vi.fn().mockResolvedValue('R-1') }));
vi.mock('@/lib/subscription', () => ({
  SubscriptionService: { recordTransaction: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/ecommerce/shopify-token', () => ({
  getShopifyAccessTokenForIntegration: vi.fn().mockResolvedValue('tok'),
}));
vi.mock('@/lib/ecommerce/shopify-catalog', () => ({
  shopifyFetchAllCatalogProducts: vi.fn(),
  shopifySetInventoryLevel: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ecommerce/woocommerce-catalog', () => ({
  wooFetchAllCatalogProducts: vi.fn(),
  wooSetProductStock: vi.fn().mockResolvedValue(undefined),
}));

import Product from '@/models/Product';
import ProductChannelListing from '@/models/ProductChannelListing';
import TenantEcommerceIntegration from '@/models/TenantEcommerceIntegration';
import Transaction from '@/models/Transaction';
import Payment from '@/models/Payment';
import { updateStock, insertStockMovements } from '@/lib/stock';
import { shopifyFetchAllCatalogProducts, shopifySetInventoryLevel } from '@/lib/ecommerce/shopify-catalog';
import { runCatalogSync } from '@/lib/ecommerce/sync-catalog';
import { pushChannelInventoryForProducts, pushChannelInventoryForProduct } from '@/lib/ecommerce/inventory-push';
import { handleShopifyWebhook } from '@/lib/ecommerce/process-channel-webhook';
import { importPaidChannelOrder } from '@/lib/ecommerce/import-channel-order';

/** Chainable mongoose query stub resolving `value` from `.lean()`. */
function chain(value: unknown) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  q.select = vi.fn(() => q);
  q.session = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(value);
  return q;
}

const calls = (fn: unknown): any[][] => (fn as { mock: { calls: any[][] } }).mock.calls; // eslint-disable-line @typescript-eslint/no-explicit-any
const oid = () => new mongoose.Types.ObjectId();
const tenantId = oid();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runCatalogSync', () => {
  const integration = { _id: oid(), tenantId, provider: 'shopify', shopDomain: 's.myshopify.com' };
  const variant = (id: string, sku: string | null, extra: Record<string, unknown> = {}) => ({
    externalProductId: 'P',
    externalVariantId: id,
    title: `V${id}`,
    sku,
    price: 5,
    inventoryQuantity: 3,
    ...extra,
  });

  it('resolves all SKUs in one read, prefers variation matches, and batches writes', async () => {
    const withVar = {
      _id: oid(),
      sku: 'A',
      image: '',
      hasVariations: true,
      variations: [{ sku: 'A', size: 'L' }],
    };
    const direct = { _id: oid(), sku: 'A', image: 'x.png', hasVariations: false };
    const plain = { _id: oid(), sku: 'B', image: '', hasVariations: false };
    vi.mocked(Product.find).mockReturnValue(chain([direct, withVar, plain]) as never);
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      {
        externalProductId: 'P',
        title: 'T',
        imageUrl: 'img.png',
        variants: [variant('1', ' A '), variant('2', 'B'), variant('3', 'B'), variant('4', 'Z'), variant('5', null)],
      },
    ] as never);
    vi.mocked(ProductChannelListing.bulkWrite).mockResolvedValue({} as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: false });

    expect(r).toEqual({ linked: 3, created: 0, skipped: 2 });
    expect(Product.find).toHaveBeenCalledTimes(1);
    const filter = calls(Product.find)[0][0];
    expect(filter.tenantId).toBe(tenantId);
    expect(filter.isActive).toBe(true);
    expect(Product.insertMany).not.toHaveBeenCalled();

    const listingOps = calls(ProductChannelListing.bulkWrite)[0][0];
    expect(listingOps).toHaveLength(3);
    const set1 = listingOps[0].updateOne.update.$set;
    expect(set1.productId).toBe(withVar._id); // variation match wins over the direct sku match
    expect(set1.variation).toEqual({ size: 'L', color: undefined, type: undefined });
    expect(listingOps[0].updateOne.filter).toMatchObject({ tenantId, provider: 'shopify', externalVariantId: '1' });
    expect(listingOps[0].updateOne.upsert).toBe(true);

    // Image back-filled once per product even though two variants matched "B"
    const imageOps = calls(Product.bulkWrite)[0][0];
    expect(imageOps).toHaveLength(2);
    expect(imageOps.map((o: { updateOne: { filter: { _id: string; tenantId: unknown } } }) => o.updateOne.filter)).toEqual([
      { _id: withVar._id.toString(), tenantId },
      { _id: plain._id.toString(), tenantId },
    ]);
  });

  it('auto-creates one product per new SKU and reuses it for later variants', async () => {
    vi.mocked(Product.find).mockReturnValue(chain([]) as never);
    vi.mocked(Product.insertMany).mockImplementation((async (docs: Array<{ _id: unknown }>) => docs) as never);
    vi.mocked(ProductChannelListing.bulkWrite).mockResolvedValue({} as never);
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      { externalProductId: 'P', title: 'T', variants: [variant('1', 'N'), variant('2', 'N '), variant('3', null)] },
    ] as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: true });

    expect(r).toEqual({ linked: 3, created: 2, skipped: 0 });
    const docs = calls(Product.insertMany)[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ tenantId, sku: 'N', stock: 3, isActive: true });
    const ops = calls(ProductChannelListing.bulkWrite)[0][0];
    expect(ops[0].updateOne.update.$set.productId).toBe(docs[0]._id);
    expect(ops[1].updateOne.update.$set.productId).toBe(docs[0]._id);
    expect(ops[2].updateOne.update.$set.productId).toBe(docs[1]._id);
  });

  it('skips variants whose product failed to insert', async () => {
    const productFind = vi.mocked(Product.find);
    productFind.mockReturnValueOnce(chain([]) as never);
    vi.mocked(Product.insertMany).mockRejectedValue(new Error('E11000 duplicate key'));
    vi.mocked(ProductChannelListing.bulkWrite).mockResolvedValue({} as never);
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      { externalProductId: 'P', title: 'T', variants: [variant('1', 'N'), variant('2', 'M')] },
    ] as never);
    // Re-check finds only the second product
    productFind.mockImplementationOnce(((filter: { _id: { $in: unknown[] } }) =>
      chain([{ _id: filter._id.$in[1] }])) as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: true });

    expect(r).toEqual({ linked: 1, created: 1, skipped: 1 });
    expect(calls(Product.find)[1][0].tenantId).toBe(tenantId);
  });
});

describe('pushChannelInventoryForProducts', () => {
  const p1 = oid();
  const p2 = oid();
  const integ = { provider: 'shopify', shopDomain: 's.myshopify.com', shopifyLocationId: 'loc' };

  it('reads listings, integrations and products once and computes stock in memory', async () => {
    vi.mocked(TenantEcommerceIntegration.exists).mockResolvedValue({ _id: oid() } as never);
    vi.mocked(ProductChannelListing.find).mockReturnValue(
      chain([
        { productId: p1, provider: 'shopify', inventoryItemId: 'i1', externalVariantId: 'v1' },
        { productId: p2, provider: 'shopify', inventoryItemId: 'i2', externalVariantId: 'v2', variation: { size: 'M' } },
      ]) as never
    );
    vi.mocked(TenantEcommerceIntegration.find).mockReturnValue(chain([integ]) as never);
    vi.mocked(Product.find).mockReturnValue(
      chain([
        { _id: p1, trackInventory: true, stock: 7 },
        { _id: p2, trackInventory: true, hasVariations: true, variations: [{ size: 'S', stock: 1 }, { size: 'M', stock: 4 }] },
      ]) as never
    );

    await pushChannelInventoryForProducts(tenantId.toString(), [p1.toString(), p2.toString(), p1.toString()]);

    expect(ProductChannelListing.find).toHaveBeenCalledTimes(1);
    expect(calls(ProductChannelListing.find)[0][0]).toEqual({
      tenantId: tenantId.toString(),
      productId: { $in: [p1.toString(), p2.toString()] },
    });
    expect(TenantEcommerceIntegration.find).toHaveBeenCalledTimes(1);
    expect(Product.find).toHaveBeenCalledTimes(1);
    expect(calls(Product.find)[0][0].tenantId).toBe(tenantId.toString());
    const pushed = calls(shopifySetInventoryLevel).map((c) => [c[3], c[4]]);
    expect(pushed).toEqual(expect.arrayContaining([['i1', 7], ['i2', 4]]));
  });

  it('skips everything for tenants without integrations and for channel-originated changes', async () => {
    vi.mocked(TenantEcommerceIntegration.exists).mockResolvedValue(null as never);
    await pushChannelInventoryForProduct(tenantId.toString(), p1.toString());
    await pushChannelInventoryForProducts(tenantId.toString(), [p1.toString()], { stockReason: 'channel_sale' });
    expect(ProductChannelListing.find).not.toHaveBeenCalled();
  });
});

describe('Shopify refund webhook', () => {
  it('looks up listings and products once and inserts movements once', async () => {
    const p1 = oid();
    vi.mocked(TenantEcommerceIntegration.findOne).mockResolvedValue({ tenantId } as never);
    vi.mocked(ProductChannelListing.find).mockReturnValue(
      chain([{ externalVariantId: '11', productId: p1 }]) as never
    );
    const snap = { _id: p1, trackInventory: true, stock: 2 };
    vi.mocked(Product.find).mockReturnValue(chain([snap]) as never);

    await handleShopifyWebhook('s.myshopify.com', 'refunds/create', '', {
      id: 1,
      order_id: 9,
      refund_line_items: [
        { quantity: 2, line_item: { variant_id: 11, product_id: 1, quantity: 2 } },
        { quantity: 1, line_item: { variant_id: 12, product_id: 1, quantity: 1 } },
      ],
    });

    expect(ProductChannelListing.find).toHaveBeenCalledTimes(1);
    expect(calls(ProductChannelListing.find)[0][0]).toMatchObject({
      tenantId: tenantId.toString(),
      provider: 'shopify',
      externalVariantId: { $in: ['11', '12'] },
    });
    expect(updateStock).toHaveBeenCalledTimes(1);
    const [pid, tid, qty, type, opts] = calls(updateStock)[0];
    expect([pid, tid, qty, type]).toEqual([p1.toString(), tenantId.toString(), 2, 'return']);
    expect(opts.product).toBe(snap);
    expect(Array.isArray(opts.movements)).toBe(true);
    expect(insertStockMovements).toHaveBeenCalledTimes(1);
    expect(calls(insertStockMovements)[0][0]).toBe(opts.movements);
  });
});

describe('importPaidChannelOrder', () => {
  it('stamps movements with a pre-generated transaction id and inserts them once', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      abortTransaction: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn(),
    };
    const startSession = vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
    const p1 = oid();
    vi.mocked(Transaction.findOne).mockReturnValue(chain(null) as never);
    vi.mocked(ProductChannelListing.find).mockReturnValue(
      chain([{ externalVariantId: 'v1', productId: p1 }]) as never
    );
    const productQuery = chain([{ _id: p1, trackInventory: true, stock: 10 }]);
    vi.mocked(Product.find).mockReturnValue(productQuery as never);
    vi.mocked(Transaction.create).mockImplementation((async (docs: Array<{ _id: unknown }>) => docs) as never);
    vi.mocked(Payment.create).mockResolvedValue([] as never);

    const r = await importPaidChannelOrder(tenantId.toString(), {
      provider: 'shopify',
      externalOrderId: '501',
      currency: 'USD',
      subtotal: 20,
      taxTotal: 0,
      total: 20,
      lines: [
        { externalVariantId: 'v1', externalProductId: 'p', name: 'W', quantity: 1, unitPrice: 10, sku: null },
        { externalVariantId: 'v1', externalProductId: 'p', name: 'W', quantity: 1, unitPrice: 10, sku: null },
      ],
    });

    expect(r.ok).toBe(true);
    expect(Product.find).toHaveBeenCalledTimes(1);
    expect(calls(Product.find)[0][0]).toEqual({ _id: { $in: [p1.toString()] }, tenantId: tenantId.toString() });
    expect(productQuery.session).toHaveBeenCalledWith(session);
    expect(updateStock).toHaveBeenCalledTimes(2);
    const txnDoc = calls(Transaction.create)[0][0][0];
    for (const c of calls(updateStock)) {
      expect(c[4].transactionId).toBe(txnDoc._id.toString());
      expect(c[5]).toBe(session);
    }
    expect(insertStockMovements).toHaveBeenCalledTimes(1);
    expect(calls(insertStockMovements)[0][1]).toBe(session);
    expect(r.ok && r.transactionId).toBe(txnDoc._id.toString());
    startSession.mockRestore();
  });
});
