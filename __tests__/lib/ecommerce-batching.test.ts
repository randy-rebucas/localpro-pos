/**
 * Tests for the batched ecommerce paths (catalog sync, inventory push,
 * refund restock, paid-order import).
 *
 * Never attach `.then` to a mock object (vitest thenable OOM) — repository
 * mocks below use `mockResolvedValue`.
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

const repos = vi.hoisted(() => ({
  products: { list: vi.fn(), createMany: vi.fn(), updateEach: vi.fn() },
  channelListings: { list: vi.fn(), upsertManyByVariant: vi.fn() },
  ecommerceIntegrations: {
    listActive: vi.fn(),
    hasActive: vi.fn(),
    findActiveByShopDomainAcrossTenants: vi.fn(),
    findByIdAcrossTenants: vi.fn(),
    update: vi.fn(),
  },
  transactions: { findByChannelSyncKey: vi.fn(), create: vi.fn(), count: vi.fn() },
  payments: { create: vi.fn() },
}));
const tx = vi.hoisted(() => ({ driver: 'mongo' as const }));
const runInTransaction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual, getRepos: () => repos, runInTransaction };
});

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

import { DuplicateKeyError } from '@/lib/db';
import { logger } from '@/lib/logger';
import { updateStock, insertStockMovements } from '@/lib/stock';
import { shopifyFetchAllCatalogProducts, shopifySetInventoryLevel } from '@/lib/ecommerce/shopify-catalog';
import { runCatalogSync } from '@/lib/ecommerce/sync-catalog';
import { pushChannelInventoryForProducts, pushChannelInventoryForProduct } from '@/lib/ecommerce/inventory-push';
import { handleShopifyWebhook, handleWooCommerceWebhook } from '@/lib/ecommerce/process-channel-webhook';
import { importPaidChannelOrder } from '@/lib/ecommerce/import-channel-order';

const calls = (fn: unknown): any[][] => (fn as { mock: { calls: any[][] } }).mock.calls; // eslint-disable-line @typescript-eslint/no-explicit-any
const oid = () => new mongoose.Types.ObjectId().toHexString();
const tenantId = oid();

beforeEach(() => {
  vi.clearAllMocks();
  repos.channelListings.upsertManyByVariant.mockResolvedValue({ failedIndexes: [] });
  repos.products.updateEach.mockResolvedValue(0);
  runInTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
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
    repos.products.list.mockResolvedValue([direct, withVar, plain]);
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      {
        externalProductId: 'P',
        title: 'T',
        imageUrl: 'img.png',
        variants: [variant('1', ' A '), variant('2', 'B'), variant('3', 'B'), variant('4', 'Z'), variant('5', null)],
      },
    ] as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: false });

    expect(r).toEqual({ linked: 3, created: 0, skipped: 2 });
    expect(repos.ecommerceIntegrations.update).toHaveBeenCalledWith(tenantId, 'shopify', {
      lastSyncAt: expect.any(Date),
      lastError: undefined,
    });
    expect(repos.products.list).toHaveBeenCalledTimes(1);
    const [tid, filter] = calls(repos.products.list)[0];
    expect(tid).toBe(tenantId);
    expect(filter).toMatchObject({ active: 'flagged', skuOrVariationSkuIn: ['A', 'B', 'Z'] });
    expect(repos.products.createMany).not.toHaveBeenCalled();

    const [listingTenant, provider, items] = calls(repos.channelListings.upsertManyByVariant)[0];
    expect([listingTenant, provider]).toEqual([tenantId, 'shopify']);
    expect(items).toHaveLength(3);
    expect(items[0].externalVariantId).toBe('1');
    expect(items[0].set.productId).toBe(withVar._id); // variation match wins over the direct sku match
    expect(items[0].set.variation).toEqual({ size: 'L', color: undefined, type: undefined });

    // Image back-filled once per product even though two variants matched "B"
    const [imageTenant, imageUpdates] = calls(repos.products.updateEach)[0];
    expect(imageTenant).toBe(tenantId);
    expect(imageUpdates.map((u: { id: string }) => u.id)).toEqual([withVar._id, plain._id]);
  });

  it('auto-creates one product per new SKU and reuses it for later variants', async () => {
    repos.products.list.mockResolvedValue([]);
    repos.products.createMany.mockImplementation(async (_t: string, docs: Array<{ _id: string }>) => ({
      insertedIds: docs.map((d) => d._id),
    }));
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      { externalProductId: 'P', title: 'T', variants: [variant('1', 'N'), variant('2', 'N '), variant('3', null)] },
    ] as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: true });

    expect(r).toEqual({ linked: 3, created: 2, skipped: 0 });
    const [createTenant, docs] = calls(repos.products.createMany)[0];
    expect(createTenant).toBe(tenantId);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ sku: 'N', stock: 3, isActive: true });
    const items = calls(repos.channelListings.upsertManyByVariant)[0][2];
    expect(items[0].set.productId).toBe(docs[0]._id);
    expect(items[1].set.productId).toBe(docs[0]._id);
    expect(items[2].set.productId).toBe(docs[1]._id);
  });

  it('skips variants whose product failed to insert', async () => {
    repos.products.list.mockResolvedValue([]);
    // Only the second product landed
    repos.products.createMany.mockImplementation(async (_t: string, docs: Array<{ _id: string }>) => ({
      insertedIds: [docs[1]._id],
      error: new Error('E11000 duplicate key'),
    }));
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      { externalProductId: 'P', title: 'T', variants: [variant('1', 'N'), variant('2', 'M')] },
    ] as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: true });

    expect(r).toEqual({ linked: 1, created: 1, skipped: 1 });
  });

  it('counts the listings a failed upsert batch reports as skipped', async () => {
    repos.products.list.mockResolvedValue([
      { _id: oid(), sku: 'A', image: 'a.png', hasVariations: false },
      { _id: oid(), sku: 'B', image: 'b.png', hasVariations: false },
    ]);
    repos.channelListings.upsertManyByVariant.mockResolvedValue({ error: new Error('bulk'), failedIndexes: [1] });
    vi.mocked(shopifyFetchAllCatalogProducts).mockResolvedValue([
      { externalProductId: 'P', title: 'T', variants: [variant('1', 'A'), variant('2', 'B')] },
    ] as never);

    const r = await runCatalogSync({ integration: integration as never, autoCreateProducts: false });

    expect(r).toEqual({ linked: 1, created: 0, skipped: 1 });
  });
});

describe('pushChannelInventoryForProducts', () => {
  const p1 = oid();
  const p2 = oid();
  const integ = { provider: 'shopify', shopDomain: 's.myshopify.com', shopifyLocationId: 'loc' };

  it('reads listings, integrations and products once and computes stock in memory', async () => {
    repos.ecommerceIntegrations.hasActive.mockResolvedValue(true);
    repos.channelListings.list.mockResolvedValue([
      { productId: p1, provider: 'shopify', inventoryItemId: 'i1', externalVariantId: 'v1' },
      { productId: p2, provider: 'shopify', inventoryItemId: 'i2', externalVariantId: 'v2', variation: { size: 'M' } },
    ]);
    repos.ecommerceIntegrations.listActive.mockResolvedValue([integ]);
    repos.products.list.mockResolvedValue([
      { _id: p1, trackInventory: true, stock: 7 },
      { _id: p2, trackInventory: true, hasVariations: true, variations: [{ size: 'S', stock: 1 }, { size: 'M', stock: 4 }] },
    ]);

    await pushChannelInventoryForProducts(tenantId, [p1, p2, p1]);

    expect(repos.channelListings.list).toHaveBeenCalledTimes(1);
    expect(calls(repos.channelListings.list)[0]).toEqual([tenantId, { productIds: [p1, p2] }]);
    expect(repos.ecommerceIntegrations.listActive).toHaveBeenCalledTimes(1);
    expect(repos.products.list).toHaveBeenCalledTimes(1);
    expect(calls(repos.products.list)[0][0]).toBe(tenantId);
    expect(calls(repos.products.list)[0][1]).toEqual({ ids: [p1, p2] });
    const pushed = calls(shopifySetInventoryLevel).map((c) => [c[3], c[4]]);
    expect(pushed).toEqual(expect.arrayContaining([['i1', 7], ['i2', 4]]));
  });

  it('skips everything for tenants without integrations and for channel-originated changes', async () => {
    repos.ecommerceIntegrations.hasActive.mockResolvedValue(false);
    await pushChannelInventoryForProduct(tenantId, p1);
    await pushChannelInventoryForProducts(tenantId, [p1], { stockReason: 'channel_sale' });
    expect(repos.channelListings.list).not.toHaveBeenCalled();
  });
});

describe('Shopify refund webhook', () => {
  it('looks up listings and products once and inserts movements once', async () => {
    const p1 = oid();
    repos.ecommerceIntegrations.findActiveByShopDomainAcrossTenants.mockResolvedValue({ tenantId });
    repos.channelListings.list.mockResolvedValue([{ externalVariantId: '11', productId: p1 }]);
    const snap = { _id: p1, trackInventory: true, stock: 2 };
    repos.products.list.mockResolvedValue([snap]);

    await handleShopifyWebhook('s.myshopify.com', 'refunds/create', '', {
      id: 1,
      order_id: 9,
      refund_line_items: [
        { quantity: 2, line_item: { variant_id: 11, product_id: 1, quantity: 2 } },
        { quantity: 1, line_item: { variant_id: 12, product_id: 1, quantity: 1 } },
      ],
    });

    expect(repos.channelListings.list).toHaveBeenCalledTimes(1);
    const [tid, filter] = calls(repos.channelListings.list)[0];
    expect(tid).toBe(tenantId);
    expect(filter).toEqual({ provider: 'shopify', externalVariantIds: ['11', '12'] });
    expect(updateStock).toHaveBeenCalledTimes(1);
    const [pid, stockTenant, qty, type, opts] = calls(updateStock)[0];
    expect([pid, stockTenant, qty, type]).toEqual([p1, tenantId, 2, 'return']);
    expect(opts.product).toBe(snap);
    expect(Array.isArray(opts.movements)).toBe(true);
    expect(insertStockMovements).toHaveBeenCalledTimes(1);
    expect(calls(insertStockMovements)[0][0]).toBe(opts.movements);
  });
});

describe('WooCommerce webhook', () => {
  it.each([
    ['missing', null],
    ['another provider', { tenantId, provider: 'shopify', isActive: true }],
    ['inactive', { tenantId, provider: 'woocommerce', isActive: false }],
  ])('answers 404 for an integration that is %s', async (_label, integration) => {
    repos.ecommerceIntegrations.findByIdAcrossTenants.mockResolvedValue(integration);

    const r = await handleWooCommerceWebhook(oid(), '', {});

    expect(r).toEqual({ status: 404, body: 'unknown integration' });
  });
});

describe('importPaidChannelOrder', () => {
  const p1 = oid();
  const order = {
    provider: 'shopify' as const,
    externalOrderId: '501',
    currency: 'USD',
    subtotal: 20,
    taxTotal: 0,
    total: 20,
    lines: [
      { externalVariantId: 'v1', externalProductId: 'p', name: 'W', quantity: 1, unitPrice: 10, sku: null },
      { externalVariantId: 'v1', externalProductId: 'p', name: 'W', quantity: 1, unitPrice: 10, sku: null },
    ],
  };

  beforeEach(() => {
    repos.transactions.findByChannelSyncKey.mockResolvedValue(null);
    repos.channelListings.list.mockResolvedValue([{ externalVariantId: 'v1', productId: p1 }]);
    repos.products.list.mockResolvedValue([{ _id: p1, trackInventory: true, stock: 10 }]);
    repos.transactions.create.mockImplementation(async (_t: string, input: { _id: string }) => input);
    repos.payments.create.mockResolvedValue({});
  });

  it('stamps movements with a pre-generated transaction id and inserts them once', async () => {
    const r = await importPaidChannelOrder(tenantId, order);

    expect(r.ok).toBe(true);
    expect(repos.transactions.findByChannelSyncKey).toHaveBeenCalledWith(tenantId, 'shopify:501');
    expect(repos.products.list).toHaveBeenCalledTimes(1);
    const [tid, filter, opts] = calls(repos.products.list)[0];
    expect([tid, filter]).toEqual([tenantId, { ids: [p1] }]);
    expect(opts.tx).toBe(tx);
    expect(updateStock).toHaveBeenCalledTimes(2);
    const [txnTenant, txnDoc, txnOpts] = calls(repos.transactions.create)[0];
    expect(txnTenant).toBe(tenantId);
    expect(txnOpts).toEqual({ tx });
    for (const c of calls(updateStock)) {
      expect(c[4].transactionId).toBe(txnDoc._id);
      expect(c[5]).toBe(tx);
    }
    expect(insertStockMovements).toHaveBeenCalledTimes(1);
    expect(calls(insertStockMovements)[0][1]).toBe(tx);
    const [paymentTenant, paymentDoc, paymentOpts] = calls(repos.payments.create)[0];
    expect(paymentTenant).toBe(tenantId);
    expect(paymentDoc.transactionId).toBe(txnDoc._id);
    expect(paymentOpts).toEqual({ tx });
    expect(r.ok && r.transactionId).toBe(txnDoc._id);
  });

  it('starts each transaction retry from clean state and returns the last attempt', async () => {
    runInTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => {
      await fn(tx); // rolled back by a transient error
      return fn(tx);
    });

    const r = await importPaidChannelOrder(tenantId, order);

    const [first, second] = calls(repos.transactions.create).map((c) => c[1]._id);
    expect(first).not.toBe(second);
    const [firstMovements, secondMovements] = calls(insertStockMovements).map((c) => c[0]);
    expect(firstMovements).not.toBe(secondMovements);
    expect(r.ok && r.transactionId).toBe(second);
  });

  it('reports a duplicate key as a duplicate, without logging an error', async () => {
    repos.transactions.create.mockRejectedValue(new DuplicateKeyError());

    const r = await importPaidChannelOrder(tenantId, order);

    expect(r).toEqual({ ok: false, duplicate: true, reason: 'duplicate_key' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs any other failure and returns its message', async () => {
    repos.transactions.create.mockRejectedValue(new Error('boom'));

    const r = await importPaidChannelOrder(tenantId, order);

    expect(r).toEqual({ ok: false, reason: 'boom' });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
