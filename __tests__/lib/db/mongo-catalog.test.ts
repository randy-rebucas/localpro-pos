/**
 * Mongo catalog repositories: tenant scoping, ProductFilter translation and
 * the atomic stock adjustments behind lib/stock.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import ProductModel from '@/models/Product';
import ProductBundleModel from '@/models/ProductBundle';
import ProductChannelListingModel from '@/models/ProductChannelListing';
import TaxRuleModel from '@/models/TaxRule';
import { mongoCatalogRepos as repos } from '@/lib/db/mongo/catalog';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const BRANCH = '64abc123def4567890abc111';
const now = new Date('2026-11-01T00:00:00Z');

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

const firstArg = (spy: { mock: { calls: unknown[][] } }, i = 0) => spy.mock.calls[i][0] as Record<string, unknown>;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('catalog methods scope by tenant', () => {
  it('product reads', async () => {
    const find = vi.spyOn(ProductModel, 'find').mockReturnValue(leanQuery([]) as never);
    const findOne = vi.spyOn(ProductModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    const count = vi.spyOn(ProductModel, 'countDocuments').mockResolvedValue(0 as never);
    await repos.products.list(TENANT, { search: 'x' });
    await repos.products.findOne(TENANT, { code: 'ABC' });
    await repos.products.findById(TENANT, ID);
    await repos.products.count(TENANT);
    await repos.products.listLowStockCandidates(TENANT, { select: 'name' });
    for (const spy of [find, findOne, count]) {
      for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
    }
  });

  it('product create cannot be redirected to another tenant by the input', async () => {
    const spy = vi.spyOn(ProductModel, 'create').mockResolvedValue({ _id: ID } as never);
    await repos.products.create(TENANT, { name: 'x', price: 1, tenantId: 'other' } as never);
    expect(firstArg(spy)).toMatchObject({ tenantId: TENANT });
  });

  it('bundles, channel listings and tax rules', async () => {
    const bundleFind = vi.spyOn(ProductBundleModel, 'find').mockReturnValue(leanQuery([]) as never);
    const bundleMany = vi.spyOn(ProductBundleModel, 'updateMany').mockResolvedValue({ modifiedCount: 0 } as never);
    const listingFind = vi.spyOn(ProductChannelListingModel, 'find').mockReturnValue(leanQuery([]) as never);
    const listingDelete = vi.spyOn(ProductChannelListingModel, 'deleteMany').mockResolvedValue({} as never);
    const taxFind = vi.spyOn(TaxRuleModel, 'find').mockReturnValue(leanQuery([]) as never);
    const taxDelete = vi.spyOn(TaxRuleModel, 'findOneAndDelete').mockReturnValue(leanQuery(null) as never);

    await repos.bundles.list(TENANT, { search: 'combo' });
    await repos.bundles.setActiveMany(TENANT, [ID], false);
    await repos.channelListings.list(TENANT, { provider: 'shopify', productIds: [ID] });
    await repos.channelListings.deleteForProvider(TENANT, 'shopify');
    await repos.taxRules.list(TENANT, { isActive: true });
    await repos.taxRules.delete(TENANT, ID);

    for (const spy of [bundleFind, bundleMany, listingFind, listingDelete, taxFind, taxDelete]) {
      expect(firstArg(spy)).toMatchObject({ tenantId: TENANT });
    }
  });
});

describe('ProductFilter translation', () => {
  async function query(filter: Parameters<typeof repos.products.list>[1]) {
    const spy = vi.spyOn(ProductModel, 'find').mockReturnValue(leanQuery([]) as never);
    await repos.products.list(TENANT, filter);
    return firstArg(spy, spy.mock.calls.length - 1);
  }

  it('active flags', async () => {
    expect(await query({ active: true })).toEqual({ tenantId: TENANT, isActive: { $ne: false } });
    expect(await query({ active: false })).toEqual({ tenantId: TENANT, isActive: false });
    expect(await query({ active: 'flagged' })).toEqual({ tenantId: TENANT, isActive: true });
  });

  it('ids and excludeId share the _id condition', async () => {
    expect(await query({ ids: [ID], excludeId: BRANCH })).toEqual({ tenantId: TENANT, _id: { $in: [ID], $ne: BRANCH } });
  });

  it('search is regex-escaped and case-insensitive over the chosen fields', async () => {
    const q = await query({ search: 'a.b', searchFields: ['name', 'description'] });
    expect(q.$and).toEqual([
      { $or: [{ name: { $regex: 'a\\.b', $options: 'i' } }, { description: { $regex: 'a\\.b', $options: 'i' } }] },
    ]);
  });

  it('several $or conditions are combined with $and', async () => {
    const q = await query({ search: 'x', missing: 'image' });
    expect((q.$and as unknown[]).length).toBe(2);
    expect(q).not.toHaveProperty('$or');
  });

  it('exact name and case-insensitive code match', async () => {
    const q = await query({ name: 'Tea (L)', code: 'ab1', codeInsensitive: true });
    expect(q.name).toEqual({ $regex: '^Tea \\(L\\)$', $options: 'i' });
    expect(q.$and).toEqual([
      { $or: [{ barcode: { $regex: '^ab1$', $options: 'i' } }, { sku: { $regex: '^ab1$', $options: 'i' } }] },
    ]);
  });

  it('expiry range and branch stock', async () => {
    expect(await query({ expiryDate: { gte: now, lte: now }, hasBranchStock: true, drugSchedule: 'rx' })).toEqual({
      tenantId: TENANT,
      expiryDate: { $gte: now, $lte: now },
      branchStock: { $exists: true, $ne: [] },
      drugSchedule: 'rx',
    });
  });
});

describe('products.adjustStock', () => {
  async function capture(...args: Parameters<typeof repos.products.adjustStock>) {
    const spy = vi.spyOn(ProductModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID, stock: 1 }) as never);
    spy.mockClear();
    const result = await repos.products.adjustStock(...args);
    return { result, call: spy.mock.calls[spy.mock.calls.length - 1] as unknown as [Record<string, unknown>, Record<string, unknown>] | undefined };
  }

  it('guards master stock against going negative', async () => {
    const { call } = await capture(TENANT, ID, { kind: 'master' }, -2, { allowNegative: false });
    expect(call![0]).toEqual({ _id: ID, tenantId: TENANT, stock: { $gte: 2 } });
    expect(call![1]).toEqual({ $inc: { stock: -2 } });
  });

  it('no guard when negatives are allowed or the quantity is positive', async () => {
    expect((await capture(TENANT, ID, { kind: 'master' }, -2, { allowNegative: true })).call![0]).toEqual({ _id: ID, tenantId: TENANT });
    expect((await capture(TENANT, ID, { kind: 'master' }, 3, { allowNegative: false })).call![0]).toEqual({ _id: ID, tenantId: TENANT });
  });

  it('variation and branch targets use $elemMatch and the positional operator', async () => {
    const v = await capture(TENANT, ID, { kind: 'variation', variationId: 'v1' }, -3, { allowNegative: false });
    expect(v.call![0]).toEqual({ _id: ID, tenantId: TENANT, variations: { $elemMatch: { _id: 'v1', stock: { $gte: 3 } } } });
    expect(v.call![1]).toEqual({ $inc: { 'variations.$.stock': -3 } });

    const b = await capture(TENANT, ID, { kind: 'branch', branchId: BRANCH }, 4, { allowNegative: false });
    expect(b.call![0]).toEqual({ _id: ID, tenantId: TENANT, branchStock: { $elemMatch: { branchId: BRANCH } } });
    expect(b.call![1]).toEqual({ $inc: { 'branchStock.$.stock': 4 } });
  });

  it('newBranch pushes an entry only when the branch has none', async () => {
    const { call } = await capture(TENANT, ID, { kind: 'newBranch', branchId: BRANCH }, 5, { allowNegative: false });
    expect(call![0]).toEqual({ _id: ID, tenantId: TENANT, 'branchStock.branchId': { $ne: BRANCH } });
    expect(call![1]).toEqual({ $push: { branchStock: { branchId: BRANCH, stock: 5 } } });
  });

  it('a negative new branch entry is refused without a write', async () => {
    const { result, call } = await capture(TENANT, ID, { kind: 'newBranch', branchId: BRANCH }, -1, { allowNegative: false });
    expect(result).toBeNull();
    expect(call).toBeUndefined();
  });
});

describe('product writes', () => {
  it('update sets and unsets, runs validators, and reports changed fields', async () => {
    vi.spyOn(ProductModel, 'findOne').mockReturnValue(leanQuery({ _id: ID, name: 'Old', price: 5, image: 'a.png' }) as never);
    const spy = vi.spyOn(ProductModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID, name: 'New', price: 5 }) as never);
    const result = await repos.products.update(TENANT, ID, { name: 'New', price: 5, image: null });
    const [filter, update, options] = spy.mock.calls[0] as unknown as Record<string, unknown>[];
    expect(filter).toEqual({ _id: ID, tenantId: TENANT });
    expect(update).toEqual({ $set: { name: 'New', price: 5 }, $unset: { image: 1 } });
    expect(options).toMatchObject({ new: true, runValidators: true });
    expect(result!.changed.sort()).toEqual(['image', 'name']);
  });

  it('createMany reports the rows that landed when the unordered insert fails', async () => {
    vi.spyOn(ProductModel, 'insertMany').mockRejectedValue(new Error('dup'));
    vi.spyOn(ProductModel, 'find').mockReturnValue(leanQuery([{ _id: ID }]) as never);
    const res = await repos.products.createMany(TENANT, [{ _id: ID, name: 'a', price: 1 }, { name: 'b', price: 1 }]);
    expect(res.insertedIds).toEqual([ID]);
    expect(res.error).toBeInstanceOf(Error);
  });

  it('upsertManyByVariant returns the rejected item indexes', async () => {
    vi.spyOn(ProductChannelListingModel, 'bulkWrite').mockRejectedValue(
      Object.assign(new Error('bulk'), { writeErrors: [{ index: 1 }] })
    );
    const res = await repos.channelListings.upsertManyByVariant(TENANT, 'shopify', [
      { externalVariantId: 'a', set: { productId: ID, externalProductId: 'p' } },
      { externalVariantId: 'b', set: { productId: ID, externalProductId: 'p' } },
    ]);
    expect(res.failedIndexes).toEqual([1]);
  });
});
