/**
 * Mongo implementation of the lookup-data repositories (lib/db/lookup.ts).
 * Queries are the ones the routes ran before; only the call site moved.
 */
import CategoryModel from '@/models/Category';
import BranchModel from '@/models/Branch';
import DeviceModel from '@/models/Device';
import TableModel from '@/models/Table';
import ExpenseModel from '@/models/Expense';
import DiscountModel from '@/models/Discount';
import CouponModel from '@/models/Coupon';
import FeatureFlagOverrideModel from '@/models/FeatureFlagOverride';
import LoyaltyConfigModel from '@/models/LoyaltyConfig';
import type * as L from '../lookup';
import { applyPatch, definedOnly, escapeRegex, run, sessionOf } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

const USER_FIELDS = 'name email';

// ─── Categories ─────────────────────────────────────────────────────────────

const categories: L.CategoryRepo = {
  list: (tenantId) =>
    run(async () => toApiList<L.Category>(await CategoryModel.find({ tenantId }).sort({ name: 1 }).lean())),

  findById: (tenantId, id, opts) =>
    run(async () =>
      toApiOrNull<L.Category>(
        await CategoryModel.findOne({ _id: id, tenantId, ...(opts?.activeOnly && { isActive: { $ne: false } }) }).lean()
      )
    ),

  findByName: (tenantId, name) =>
    run(async () =>
      toApiOrNull<L.Category>(
        await CategoryModel.findOne({
          tenantId,
          name: { $regex: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') },
        }).lean()
      )
    ),

  create: (tenantId, input) => run(async () => toApi<L.Category>(await CategoryModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await CategoryModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.Category>(doc, patch) : null;
    }),
};

// ─── Branches ───────────────────────────────────────────────────────────────

const branches: L.BranchRepo = {
  list: (tenantId, filter = {}) =>
    run(async () =>
      toApiList<L.BranchWithManager>(
        await BranchModel.find({ tenantId, ...definedOnly(filter) })
          .populate('managerId', USER_FIELDS)
          .sort({ name: 1 })
          .lean()
      )
    ),

  findById: (tenantId, id) => run(async () => toApiOrNull<L.Branch>(await BranchModel.findOne({ _id: id, tenantId }).lean())),

  findByIdWithManager: (tenantId, id) =>
    run(async () =>
      toApiOrNull<L.BranchWithManager>(
        await BranchModel.findOne({ _id: id, tenantId }).populate('managerId', USER_FIELDS).lean()
      )
    ),

  listActive: (tenantId) =>
    run(async () => toApiList<L.Branch>(await BranchModel.find({ tenantId, isActive: true }).sort({ name: 1 }).lean())),

  listActiveAcrossTenants: (tenantIds) =>
    run(async () =>
      toApiList<Pick<L.Branch, '_id' | 'tenantId' | 'name' | 'address'>>(
        await BranchModel.find({ tenantId: { $in: tenantIds }, isActive: true }, { tenantId: 1, name: 1, address: 1 })
          .sort({ name: 1 })
          .lean()
      )
    ),

  countActive: (tenantId) => run(() => BranchModel.countDocuments({ tenantId, isActive: true })),

  create: (tenantId, input) =>
    run(async () => toApi<L.Branch>(await BranchModel.create({ isActive: true, ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await BranchModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.Branch>(doc, patch) : null;
    }),
};

// ─── Devices ────────────────────────────────────────────────────────────────

const devices: L.DeviceRepo = {
  list: (tenantId, filter = {}) =>
    run(async () =>
      toApiList<L.DeviceWithRefs>(
        await DeviceModel.find({ tenantId, ...definedOnly(filter) })
          .populate('branchId', 'name')
          .populate('registeredBy', USER_FIELDS)
          .sort({ terminalId: 1 })
          .lean()
      )
    ),

  findById: (tenantId, id) => run(async () => toApiOrNull<L.Device>(await DeviceModel.findOne({ _id: id, tenantId }).lean())),

  create: (tenantId, input) =>
    run(async () => toApi<L.Device>(await DeviceModel.create({ ptuStatus: 'pending', isActive: true, ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await DeviceModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.Device>(doc, patch) : null;
    }),
};

// ─── Dining tables ──────────────────────────────────────────────────────────

const tables: L.DiningTableRepo = {
  list: (tenantId, filter = {}) =>
    run(async () =>
      toApiList<L.DiningTable>(await TableModel.find({ tenantId, ...definedOnly(filter) }).sort({ name: 1 }).lean())
    ),

  findById: (tenantId, id) => run(async () => toApiOrNull<L.DiningTable>(await TableModel.findOne({ _id: id, tenantId }).lean())),

  create: (tenantId, input) =>
    run(async () => toApi<L.DiningTable>(await TableModel.create({ status: 'open', isActive: true, ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await TableModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.DiningTable>(doc, patch) : null;
    }),
};

// ─── Expenses ───────────────────────────────────────────────────────────────

const expenses: L.ExpenseRepo = {
  list: (tenantId, filter = {}) =>
    run(async () => {
      const query: Record<string, unknown> = { tenantId, isActive: { $ne: false } };
      if (filter.from || filter.to) {
        query.date = { ...(filter.from && { $gte: filter.from }), ...(filter.to && { $lte: filter.to }) };
      }
      if (filter.name) query.name = filter.name;
      return toApiList<L.ExpenseWithUser>(
        await ExpenseModel.find(query).populate('userId', USER_FIELDS).sort({ date: -1 }).lean()
      );
    }),

  findById: (tenantId, id) => run(async () => toApiOrNull<L.Expense>(await ExpenseModel.findOne({ _id: id, tenantId }).lean())),

  findByIdWithUser: (tenantId, id) =>
    run(async () =>
      toApiOrNull<L.ExpenseWithUser>(await ExpenseModel.findOne({ _id: id, tenantId }).populate('userId', USER_FIELDS).lean())
    ),

  create: (tenantId, input) => run(async () => toApi<L.Expense>(await ExpenseModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await ExpenseModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.Expense>(doc, patch) : null;
    }),

  softDelete: (tenantId, id) =>
    run(async () =>
      toApiOrNull<L.Expense>(
        await ExpenseModel.findOneAndUpdate({ _id: id, tenantId, isActive: true }, { isActive: false }, { new: true }).lean()
      )
    ),

  listCashBetween: (tenantId, from, to) =>
    run(async () =>
      toApiList<Pick<L.Expense, '_id' | 'amount' | 'date'>>(
        await ExpenseModel.find({ tenantId, paymentMethod: 'cash', date: { $gte: from, $lte: to } })
          .select('amount date')
          .lean()
      )
    ),
};

// ─── Discounts ──────────────────────────────────────────────────────────────

/** usageLimit set and reached (usageLimit 0/null means unlimited, as in /api/discounts/validate). */
const LIMIT_REACHED_EXPR = {
  $and: [
    { $gt: [{ $ifNull: ['$usageLimit', 0] }, 0] },
    { $gte: [{ $ifNull: ['$usageCount', 0] }, '$usageLimit'] },
  ],
};

const SUMMARY_FIELDS = 'code name validUntil usageLimit usageCount';

/** Reads the matching discounts first when the caller needs them, then flips isActive in one write. */
async function setActiveWhere(filter: Record<string, unknown>, isActive: boolean, withDocs: boolean) {
  const docs = withDocs ? toApiList<L.DiscountSummary>(await DiscountModel.find(filter).select(SUMMARY_FIELDS).lean()) : [];
  const res = await DiscountModel.updateMany(
    withDocs ? { ...filter, _id: { $in: docs.map((d) => d._id) } } : filter,
    { $set: { isActive } }
  );
  return { modified: res.modifiedCount ?? 0, discounts: docs };
}

const discounts: L.DiscountRepo = {
  list: (tenantId, filter = {}) =>
    run(async () => {
      const query: Record<string, unknown> = { tenantId };
      if (filter.code) query.code = filter.code.toUpperCase();
      if (filter.activeAt) {
        query.isActive = true;
        query.validFrom = { $lte: filter.activeAt };
        query.validUntil = { $gte: filter.activeAt };
      }
      return toApiList<L.Discount>(await DiscountModel.find(query).sort({ createdAt: -1 }).lean());
    }),

  findById: (tenantId, id) => run(async () => toApiOrNull<L.Discount>(await DiscountModel.findOne({ _id: id, tenantId }).lean())),

  findByCode: (tenantId, code, opts) =>
    run(async () =>
      toApiOrNull<L.Discount>(
        await DiscountModel.findOne({ tenantId, code: code.toUpperCase(), ...(opts?.activeOnly && { isActive: true }) }).lean()
      )
    ),

  findValidByCodePrefix: (tenantId, prefix, now) =>
    run(async () =>
      toApiOrNull<L.Discount>(
        await DiscountModel.findOne({ tenantId, code: { $regex: `^${escapeRegex(prefix)}` }, validUntil: { $gt: now } }).lean()
      )
    ),

  create: (tenantId, input) => run(async () => toApi<L.Discount>(await DiscountModel.create({ ...input, tenantId }))),

  createIfMissing: (tenantId, input) =>
    run(async () => {
      await DiscountModel.findOneAndUpdate(
        { tenantId, code: input.code.toUpperCase() },
        { $setOnInsert: { ...input, tenantId } },
        { upsert: true }
      );
    }),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await DiscountModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<L.Discount>(doc, patch) : null;
    }),

  // The model's deleteOne hook blocks deleting a used discount
  delete: (tenantId, id) => run(async () => (await DiscountModel.deleteOne({ _id: id, tenantId })).deletedCount > 0),

  claimUsage: (tenantId, code, now) =>
    run(async () =>
      toApiOrNull<L.Discount>(
        await DiscountModel.findOneAndUpdate(
          {
            tenantId,
            code: code.toUpperCase(),
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
            $or: [
              { usageLimit: { $exists: false } },
              { usageLimit: null },
              { usageLimit: 0 },
              { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
            ],
          },
          { $inc: { usageCount: 1 } },
          { new: false } // the discount as it was, for the sale's calculations
        ).lean()
      )
    ),

  releaseUsage: (tenantId, id) =>
    run(async () => {
      await DiscountModel.updateOne({ _id: id, tenantId }, { $inc: { usageCount: -1 } });
    }),

  activateDue: (tenantId, { now, validFromAfter, withDocs }) =>
    run(() =>
      setActiveWhere(
        {
          tenantId,
          isActive: false,
          validFrom: { $gt: validFromAfter, $lte: now },
          validUntil: { $gte: now },
          $expr: { $not: [LIMIT_REACHED_EXPR] },
        },
        true,
        withDocs
      )
    ),

  deactivateDue: (tenantId, { now, withDocs }) =>
    run(() =>
      setActiveWhere(
        { tenantId, isActive: true, $or: [{ validUntil: { $lt: now } }, { $expr: LIMIT_REACHED_EXPR }] },
        false,
        withDocs
      )
    ),

  listLimitedUsedSince: (tenantId, since) =>
    run(async () =>
      toApiList<Pick<L.Discount, '_id' | 'code' | 'name' | 'usageLimit' | 'usageCount'>>(
        await DiscountModel.find({ tenantId, isActive: true, usageLimit: { $gt: 0 }, updatedAt: { $gt: since } })
          .select('code name usageLimit usageCount')
          .lean()
      )
    ),

  statusCounts: (tenantId, now) =>
    run(async () => {
      const scope = tenantId ? { tenantId } : {};
      const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        active: await DiscountModel.countDocuments({ ...scope, isActive: true, validFrom: { $lte: now }, validUntil: { $gte: now } }),
        expiringSoon: await DiscountModel.countDocuments({ ...scope, isActive: true, validUntil: { $gte: now, $lte: expiringSoon } }),
        needsActivation: await DiscountModel.countDocuments({
          ...scope,
          validFrom: { $lte: now },
          validUntil: { $gte: now },
          isActive: false,
        }),
        needsDeactivation: await DiscountModel.countDocuments({ ...scope, validUntil: { $lt: now }, isActive: true }),
      };
    }),
};

// ─── Coupons ────────────────────────────────────────────────────────────────

const coupons: L.CouponRepo = {
  list: ({ isActive, page, limit }) =>
    run(async () => {
      const query = isActive === undefined ? {} : { isActive };
      const [items, total] = await Promise.all([
        CouponModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        CouponModel.countDocuments(query),
      ]);
      return { items: toApiList<L.Coupon>(items), total };
    }),

  findByCode: (code) => run(async () => toApiOrNull<L.Coupon>(await CouponModel.findOne({ code: code.toUpperCase() }).lean())),

  create: (input) => run(async () => toApi<L.Coupon>(await CouponModel.create(input))),

  update: (id, patch) =>
    run(async () => {
      const set: Record<string, unknown> = {};
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === null) unset[k] = 1;
        else set[k] = v;
      }
      return toApiOrNull<L.Coupon>(
        await CouponModel.findByIdAndUpdate(
          id,
          { ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
          { new: true }
        ).lean()
      );
    }),

  delete: (id) => run(async () => toApiOrNull<L.Coupon>(await CouponModel.findByIdAndDelete(id).lean())),

  incrementUsage: (id, tx) =>
    run(async () => {
      const result = await CouponModel.updateOne(
        { _id: id, $or: [{ maxUses: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
        { $inc: { usedCount: 1 } },
        { session: sessionOf(tx) }
      );
      return result.modifiedCount > 0;
    }),
};

// ─── Feature-flag overrides ─────────────────────────────────────────────────

const featureFlagOverrides: L.FeatureFlagOverrideRepo = {
  list: (tenantId) =>
    run(async () =>
      toApiList<L.FeatureFlagOverride>(await FeatureFlagOverrideModel.find({ tenantId }).sort({ createdAt: -1 }).lean())
    ),

  upsert: (tenantId, feature, fields) =>
    run(async () => {
      const set: Record<string, unknown> = { tenantId, feature };
      const unset: Record<string, 1> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        if (v === null) unset[k] = 1;
        else set[k] = v;
      }
      return toApi<L.FeatureFlagOverride>(
        await FeatureFlagOverrideModel.findOneAndUpdate(
          { tenantId, feature },
          { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
          { upsert: true, new: true }
        ).lean()
      );
    }),

  delete: (tenantId, feature) =>
    run(async () => {
      await FeatureFlagOverrideModel.deleteOne({ tenantId, feature });
    }),
};

// ─── Loyalty config ─────────────────────────────────────────────────────────

const loyaltyConfigs: L.LoyaltyConfigRepo = {
  get: (tenantId) => run(async () => toApiOrNull<L.LoyaltyConfig>(await LoyaltyConfigModel.findOne({ tenantId }).lean())),

  upsert: (tenantId, patch) =>
    run(async () =>
      toApi<L.LoyaltyConfig>(
        await LoyaltyConfigModel.findOneAndUpdate({ tenantId }, { $set: definedOnly(patch) }, { upsert: true, new: true }).lean()
      )
    ),
};

export const mongoLookupRepos: L.LookupRepos = {
  categories,
  branches,
  devices,
  tables,
  expenses,
  discounts,
  coupons,
  featureFlagOverrides,
  loyaltyConfigs,
};
