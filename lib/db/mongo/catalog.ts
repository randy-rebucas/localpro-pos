/**
 * Mongo implementation of the catalog repositories (lib/db/catalog.ts).
 * Tax-rule cache invalidation still happens in the TaxRule model hooks; the
 * product negative-stock check is the Product pre-validate hook (create and
 * save only — adjustStock enforces it in its filter).
 */
import mongoose from 'mongoose';
import ProductModel from '@/models/Product';
import ProductBundleModel from '@/models/ProductBundle';
import ProductChannelListingModel from '@/models/ProductChannelListing';
import TaxRuleModel from '@/models/TaxRule';
import '@/models/Category'; // registers the schema for populate('categoryId')
import type * as C from '../catalog';
import { applyPatch, escapeRegex, run, sameValue, sessionOf, toSetUnset } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

const ci = (value: string) => ({ $regex: escapeRegex(value), $options: 'i' });
const ciExact = (value: string) => ({ $regex: `^${escapeRegex(value)}$`, $options: 'i' });

function rangeQuery(range: { gt?: unknown; gte?: unknown; lt?: unknown; lte?: unknown }) {
  return Object.fromEntries(
    (['gt', 'gte', 'lt', 'lte'] as const).filter((k) => range[k] !== undefined).map((k) => [`$${k}`, range[k]])
  );
}

/** Op indexes that failed in an unordered bulk write, or null if the error doesn't say. */
function failedWriteIndexes(err: unknown): number[] | null {
  const writeErrors = (err as { writeErrors?: unknown })?.writeErrors;
  if (!writeErrors) return null;
  const list = Array.isArray(writeErrors) ? writeErrors : [writeErrors];
  const indexes = list
    .map((we) => {
      const w = we as { index?: number; err?: { index?: number } };
      return w.index ?? w.err?.index;
    })
    .filter((n): n is number => typeof n === 'number');
  return indexes.length === list.length ? indexes : null;
}

// ─── Products ───────────────────────────────────────────────────────────────

const ACTIVE_FILTER = { true: { $ne: false }, false: false, flagged: true } as const;
const SEARCH_FIELDS = ['name', 'description', 'sku', 'barcode'] as const;
const PRODUCT_SORTS: Record<C.ProductSort, Record<string, 1 | -1>> = {
  catalog: { pinned: -1, createdAt: -1 },
  name: { name: 1 },
  expiryDate: { expiryDate: 1 },
  updatedAt: { updatedAt: 1 },
};
const STOCK_PROJECTION = { stock: 1, 'variations._id': 1, 'variations.stock': 1, branchStock: 1 };

function productQuery(tenantId: string, f: C.ProductFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId };
  const and: Record<string, unknown>[] = [];

  if (f.ids || f.excludeId) q._id = { ...(f.ids && { $in: f.ids }), ...(f.excludeId && { $ne: f.excludeId }) };
  if (f.active !== undefined) q.isActive = ACTIVE_FILTER[String(f.active) as keyof typeof ACTIVE_FILTER];
  if (f.name !== undefined) q.name = ciExact(f.name);
  if (f.search) and.push({ $or: (f.searchFields ?? SEARCH_FIELDS).map((field) => ({ [field]: ci(f.search!) })) });
  if (f.code !== undefined) {
    const match = f.codeInsensitive ? ciExact(f.code) : f.code;
    and.push({ $or: [{ barcode: match }, { sku: match }] });
  }
  if (f.sku !== undefined) q.sku = f.sku;
  if (f.skuOrVariationSkuIn) {
    and.push({ $or: [{ sku: { $in: f.skuOrVariationSkuIn } }, { hasVariations: true, 'variations.sku': { $in: f.skuOrVariationSkuIn } }] });
  }
  if (f.missing === 'barcode') {
    and.push({ $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }, { barcode: /^\s*$/ }] });
  } else if (f.missing === 'image') {
    and.push({ $or: [{ image: { $exists: false } }, { image: null }, { image: '' }] });
  }
  if (f.category !== undefined) q.category = f.category;
  if (f.categoryId) q.categoryId = f.categoryId;
  if (f.productType) q.productType = f.productType;
  if (f.trackInventory !== undefined) q.trackInventory = f.trackInventory;
  if (f.tracksInventory) and.push({ trackInventory: { $ne: false } });
  if (f.sellable) and.push({ $or: [{ stock: { $gt: 0 } }, { allowOutOfStockSales: true }] });
  if (f.hasBranchStock) q.branchStock = { $exists: true, $ne: [] };
  if (f.expiryDate) q.expiryDate = rangeQuery(f.expiryDate);
  else if (f.hasExpiryDate) q.expiryDate = { $exists: true, $ne: null };
  if (f.drugSchedule) q.drugSchedule = f.drugSchedule;

  if (and.length) q.$and = and;
  return q;
}

/** Gives every variation an _id up front, so callers and both drivers see the same ids. */
function withVariationIds<T extends { variations?: unknown }>(input: T): T {
  if (!Array.isArray(input.variations)) return input;
  return {
    ...input,
    variations: input.variations.map((v: { _id?: string }) => ({ ...v, _id: v._id ?? new mongoose.Types.ObjectId().toHexString() })),
  };
}

const products: C.ProductRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = ProductModel.find(productQuery(tenantId, filter)).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      if (opts.populateCategory) query.populate('categoryId', 'name');
      if (opts.sort) query.sort(PRODUCT_SORTS[opts.sort]);
      if (opts.page) query.skip(opts.page.skip).limit(opts.page.limit);
      return toApiList<C.ProductWithCategory>(await query.lean());
    }),

  count: (tenantId, filter) => run(() => ProductModel.countDocuments(productQuery(tenantId, filter))),

  exists: (tenantId, filter) => run(async () => !!(await ProductModel.exists(productQuery(tenantId, filter)))),

  findOne: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = ProductModel.findOne(productQuery(tenantId, filter)).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<C.Product>(await query.lean());
    }),

  findById: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = ProductModel.findOne({
        _id: id,
        tenantId,
        ...(opts.activeOnly && { isActive: { $ne: false } }),
      }).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<C.Product>(await query.lean());
    }),

  listLowStockCandidates: (tenantId, opts) =>
    run(async () => {
      const thresholdExpr = opts.threshold
        ? opts.threshold
        : { $cond: [{ $gt: [{ $ifNull: ['$lowStockThreshold', 0] }, 0] }, '$lowStockThreshold', 10] };
      const candidates: Record<string, unknown>[] = [
        { hasVariations: true },
        { $expr: { $lte: [{ $ifNull: ['$stock', 0] }, thresholdExpr] } },
      ];
      if (opts.branchId) candidates.push({ 'branchStock.branchId': opts.branchId });
      return toApiList<C.Product>(
        await ProductModel.find({ tenantId, trackInventory: true, isActive: { $ne: false }, $or: candidates })
          .select(opts.select)
          .lean()
      );
    }),

  // The model's pre-validate hook rejects negative stock unless allowOutOfStockSales
  create: (tenantId, input) =>
    run(async () => toApi<C.Product>(await ProductModel.create({ ...withVariationIds(input), tenantId }))),

  createMany: (tenantId, inputs) =>
    run(async () => {
      const docs = inputs.map((input) =>
        withVariationIds({ ...input, _id: input._id ?? new mongoose.Types.ObjectId().toHexString(), tenantId })
      );
      try {
        const inserted = await ProductModel.insertMany(docs, { ordered: false });
        return { insertedIds: inserted.map((d) => String(d._id)) };
      } catch (error) {
        // Unordered insert: some may have landed — check which
        const present = await ProductModel.find({ tenantId, _id: { $in: docs.map((d) => d._id) } }).select('_id').lean();
        return { insertedIds: present.map((d) => String(d._id)), error };
      }
    }),

  update: (tenantId, id, patch, opts = {}) =>
    run(async () => {
      const session = sessionOf(opts.tx);
      const before = toApiOrNull<C.Product>(await ProductModel.findOne({ _id: id, tenantId }).session(session ?? null).lean());
      if (!before) return null;
      const update = toSetUnset(withVariationIds(patch));
      if (!update.$set && !update.$unset) return { before, after: before, changed: [] };
      const after = toApi<C.Product>(
        await ProductModel.findOneAndUpdate({ _id: id, tenantId }, update, { new: true, runValidators: true, session }).lean()
      );
      const changed = Object.keys(patch).filter(
        (k) => patch[k as keyof C.ProductPatch] !== undefined && !sameValue(before[k as keyof C.Product], after[k as keyof C.Product])
      );
      return { before, after, changed };
    }),

  updateMany: (tenantId, filter, set) =>
    run(async () => (await ProductModel.updateMany(productQuery(tenantId, filter), toSetUnset(set))).modifiedCount),

  updateEach: (tenantId, updates) =>
    run(async () => {
      if (updates.length === 0) return 0;
      const res = await ProductModel.bulkWrite(
        updates.map(({ id, set }) => ({ updateOne: { filter: { _id: id, tenantId }, update: toSetUnset(set) } })),
        { ordered: false }
      );
      return res.modifiedCount;
    }),

  adjustPrices: (tenantId, ids, { mode, value }) =>
    run(async () => {
      if (ids.length === 0) return 0;
      const price = mode === 'percent' ? { $multiply: ['$price', 1 + value / 100] } : { $add: ['$price', value] };
      const res = await ProductModel.bulkWrite(
        ids.map((id) => ({
          updateOne: { filter: { _id: id, tenantId }, update: [{ $set: { price: { $max: [0, price] } } }] },
        })) as Parameters<typeof ProductModel.bulkWrite>[0]
      );
      return res.modifiedCount;
    }),

  softDelete: (tenantId, id) =>
    run(async () =>
      toApiOrNull<C.Product>(
        await ProductModel.findOneAndUpdate({ _id: id, tenantId, isActive: true }, { isActive: false }, { new: true }).lean()
      )
    ),

  adjustStock: (tenantId, id, target, quantity, opts) =>
    run(async () => {
      const guard = quantity < 0 && !opts.allowNegative ? { $gte: -quantity } : undefined;
      let filter: Record<string, unknown>;
      let update: Record<string, unknown>;
      switch (target.kind) {
        case 'master':
          filter = { _id: id, tenantId, ...(guard && { stock: guard }) };
          update = { $inc: { stock: quantity } };
          break;
        case 'variation':
          filter = { _id: id, tenantId, variations: { $elemMatch: { _id: target.variationId, ...(guard && { stock: guard }) } } };
          update = { $inc: { 'variations.$.stock': quantity } };
          break;
        case 'branch':
          filter = { _id: id, tenantId, branchStock: { $elemMatch: { branchId: target.branchId, ...(guard && { stock: guard }) } } };
          update = { $inc: { 'branchStock.$.stock': quantity } };
          break;
        case 'newBranch':
          // A new entry would start below zero
          if (guard) return null;
          filter = { _id: id, tenantId, 'branchStock.branchId': { $ne: target.branchId } };
          update = { $push: { branchStock: { branchId: target.branchId, stock: quantity } } };
          break;
      }
      return toApiOrNull<C.ProductStock>(
        await ProductModel.findOneAndUpdate(filter, update, {
          new: true,
          projection: STOCK_PROJECTION,
          session: sessionOf(opts.tx),
        }).lean()
      );
    }),
};

// ─── Bundles ────────────────────────────────────────────────────────────────

function bundleQuery(tenantId: string, f: C.BundleFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId };
  if (f.ids) q._id = { $in: f.ids };
  if (f.search) q.$or = [{ name: ci(f.search) }, { description: ci(f.search) }, { sku: ci(f.search) }];
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.categoryId) q.categoryId = f.categoryId;
  if (f.price) q.price = rangeQuery(f.price);
  if (f.createdAt) q.createdAt = rangeQuery(f.createdAt);
  return q;
}

function populateBundle<Q extends mongoose.Query<unknown, unknown>>(query: Q, populate?: boolean): Q {
  if (populate) query.populate('items.productId', 'name price stock').populate('categoryId', 'name');
  return query;
}

const bundles: C.BundleRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = populateBundle(ProductBundleModel.find(bundleQuery(tenantId, filter)), opts.populate).sort({ createdAt: -1 });
      if (opts.select) query.select(opts.select);
      return toApiList<C.PopulatedBundle>(await query.lean());
    }),

  findById: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = populateBundle(ProductBundleModel.findOne({ _id: id, tenantId }), opts.populate).session(
        sessionOf(opts.tx) ?? null
      );
      if (opts.select) query.select(opts.select);
      return toApiOrNull<C.PopulatedBundle>(await query.lean());
    }),

  create: (tenantId, input) => run(async () => toApi<C.ProductBundle>(await ProductBundleModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await ProductBundleModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<C.ProductBundle>(doc, patch) : null;
    }),

  setActiveMany: (tenantId, ids, isActive) =>
    run(async () => (await ProductBundleModel.updateMany({ _id: { $in: ids }, tenantId }, { $set: { isActive } })).modifiedCount),
};

// ─── Channel listings ───────────────────────────────────────────────────────

const channelListings: C.ChannelListingRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = ProductChannelListingModel.find({
        tenantId,
        ...(filter.provider && { provider: filter.provider }),
        ...(filter.productIds && { productId: { $in: filter.productIds } }),
        ...(filter.externalVariantIds && { externalVariantId: { $in: filter.externalVariantIds } }),
      });
      if (opts.select) query.select(opts.select);
      return toApiList<C.ChannelListing>(await query.lean());
    }),

  findByProduct: (tenantId, productId, provider) =>
    run(async () => toApiOrNull<C.ChannelListing>(await ProductChannelListingModel.findOne({ tenantId, productId, provider }).lean())),

  upsertForProduct: (tenantId, productId, provider, fields) =>
    run(async () => {
      await ProductChannelListingModel.findOneAndUpdate(
        { tenantId, productId, provider },
        { tenantId, productId, provider, ...fields },
        { upsert: true }
      );
    }),

  upsertManyByVariant: (tenantId, provider, items) =>
    run(async () => {
      if (items.length === 0) return { failedIndexes: [] };
      try {
        await ProductChannelListingModel.bulkWrite(
          items.map(({ externalVariantId, set }) => ({
            updateOne: { filter: { tenantId, provider, externalVariantId }, update: { $set: set }, upsert: true },
          })) as Parameters<typeof ProductChannelListingModel.bulkWrite>[0],
          { ordered: false }
        );
        return { failedIndexes: [] };
      } catch (error) {
        return { error, failedIndexes: failedWriteIndexes(error) };
      }
    }),

  deleteForProvider: (tenantId, provider) =>
    run(async () => {
      await ProductChannelListingModel.deleteMany({ tenantId, provider });
    }),
};

// ─── Tax rules ──────────────────────────────────────────────────────────────

const taxRules: C.TaxRuleRepo = {
  list: (tenantId, filter = {}) =>
    run(async () =>
      toApiList<C.TaxRule>(
        await TaxRuleModel.find({ tenantId, ...(filter.isActive !== undefined && { isActive: filter.isActive }) })
          .sort({ priority: -1, createdAt: -1 })
          .lean()
      )
    ),

  findById: (tenantId, id) => run(async () => toApiOrNull<C.TaxRule>(await TaxRuleModel.findOne({ _id: id, tenantId }).lean())),

  create: (tenantId, input) => run(async () => toApi<C.TaxRule>(await TaxRuleModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await TaxRuleModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<C.TaxRule>(doc, patch) : null;
    }),

  delete: (tenantId, id) => run(async () => toApiOrNull<C.TaxRule>(await TaxRuleModel.findOneAndDelete({ _id: id, tenantId }).lean())),
};

export const mongoCatalogRepos: C.CatalogRepos = { products, bundles, channelListings, taxRules };
