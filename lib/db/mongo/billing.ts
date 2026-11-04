/**
 * Mongo implementation of the billing repositories (lib/db/billing.ts).
 * Cache invalidation (subscription status) still happens in the
 * Subscription/SubscriptionPlan model hooks; the plan delete guard is the
 * SubscriptionPlan pre-delete hook.
 */
import type { Query } from 'mongoose';
import SubscriptionModel from '@/models/Subscription';
import SubscriptionPlanModel from '@/models/SubscriptionPlan';
import BillingEventModel from '@/models/BillingEvent';
import '@/models/Tenant'; // registers the schema for populate('tenantId')
import type * as B from '../billing';
import { run, sessionOf, toSetUnset } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

// ─── Subscription plans ─────────────────────────────────────────────────────

const activeFilter = (opts: { activeOnly?: boolean } = {}) => (opts.activeOnly ? { isActive: true } : {});

const subscriptionPlans: B.SubscriptionPlanRepo = {
  list: (filter = {}) =>
    run(async () =>
      toApiList<B.SubscriptionPlan>(
        await SubscriptionPlanModel.find(activeFilter(filter)).sort({ 'price.monthly': 1 }).lean()
      )
    ),

  findById: (id, opts) =>
    run(async () =>
      toApiOrNull<B.SubscriptionPlan>(await SubscriptionPlanModel.findOne({ _id: id, ...activeFilter(opts) }).lean())
    ),

  findByTier: (tier, opts) =>
    run(async () =>
      toApiOrNull<B.SubscriptionPlan>(await SubscriptionPlanModel.findOne({ tier, ...activeFilter(opts) }).lean())
    ),

  create: (input) => run(async () => toApi<B.SubscriptionPlan>(await SubscriptionPlanModel.create(input))),

  update: (id, patch) =>
    run(async () =>
      toApiOrNull<B.SubscriptionPlan>(
        await SubscriptionPlanModel.findByIdAndUpdate(id, toSetUnset(patch), { new: true, runValidators: true }).lean()
      )
    ),

  upsertByTier: (input) =>
    run(async () =>
      toApi<B.SubscriptionPlan>(
        await SubscriptionPlanModel.findOneAndUpdate(
          { tier: input.tier },
          { $set: input },
          { upsert: true, new: true, runValidators: true }
        ).lean()
      )
    ),

  // The model's pre('findOneAndDelete') hook rejects plans with active/trial subscriptions
  delete: (id) => run(async () => !!(await SubscriptionPlanModel.findOneAndDelete({ _id: id }))),
};

// ─── Subscriptions ──────────────────────────────────────────────────────────

const ACTIVE_OR_TRIAL = ['active', 'trial'];

function subscriptionQuery(f: B.SubscriptionFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (f.tenantId) q.tenantId = f.tenantId;
  if (f.ids) q._id = { $in: f.ids };
  if (f.status) q.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
  if (f.isTrial !== undefined) q.isTrial = f.isTrial;
  if (f.autoRenew !== undefined) q.autoRenew = f.autoRenew;
  if (f.paymentOverdue !== undefined) q.paymentOverdue = f.paymentOverdue;
  if (f.notDisabled) q.isActive = { $ne: false };
  for (const key of ['nextBillingDate', 'trialEndDate', 'endDate', 'gracePeriodEndDate'] as const) {
    const range = f[key];
    if (!range) continue;
    q[key] = {
      ...(key === 'endDate' && { $exists: true }),
      ...(range.gte && { $gte: range.gte }),
      ...(range.lte && { $lte: range.lte }),
    };
  }
  for (const key of f.unset ?? []) q[key] = { $exists: false };
  return q;
}

function withPopulate<Q extends Query<unknown, unknown>>(query: Q, populate?: B.SubscriptionPopulate): Q {
  if (populate?.tenant) query.populate('tenantId', populate.tenant);
  if (populate?.plan) query.populate('planId', populate.plan);
  return query;
}

function subscriptionUpdateDoc(ops: B.SubscriptionUpdate): Record<string, unknown> {
  const update: Record<string, unknown> = toSetUnset(ops.set ?? {});
  if (ops.addBillingEntry) update.$push = { billingHistory: ops.addBillingEntry };
  return update;
}

const subscriptions: B.SubscriptionRepo = {
  findByTenant: (tenantId, opts = {}) =>
    run(async () => {
      const query = SubscriptionModel.findOne({
        tenantId,
        ...(opts.status && { status: { $in: opts.status } }),
      }).session(sessionOf(opts.tx) ?? null);
      return toApiOrNull<B.PopulatedSubscription>(await withPopulate(query, opts.populate).lean());
    }),

  findById: (tenantId, id, opts = {}) =>
    run(async () =>
      toApiOrNull<B.PopulatedSubscription>(
        await withPopulate(SubscriptionModel.findOne({ _id: id, tenantId }), opts.populate).lean()
      )
    ),

  findByIdAcrossTenants: (id, opts = {}) =>
    run(async () =>
      toApiOrNull<B.PopulatedSubscription>(await withPopulate(SubscriptionModel.findById(id), opts.populate).lean())
    ),

  findUsage: (tenantId) =>
    run(async () => {
      const sub = await SubscriptionModel.findOne({ tenantId }).select('usage').lean();
      return sub?.usage ? toApi<B.SubscriptionUsage>(sub.usage) : null;
    }),

  listAcrossTenants: (filter, opts = {}) =>
    run(async () => {
      const query = subscriptionQuery(filter);
      const find = withPopulate(SubscriptionModel.find(query), opts.populate).sort({ createdAt: -1 });
      if (opts.omitBillingHistory) find.select('-billingHistory');
      if (!opts.page) {
        const items = toApiList<B.PopulatedSubscription>(await find.lean());
        return { items, total: items.length };
      }
      const [items, total] = await Promise.all([
        find.skip(opts.page.skip).limit(opts.page.limit).lean(),
        SubscriptionModel.countDocuments(query),
      ]);
      return { items: toApiList<B.PopulatedSubscription>(items), total };
    }),

  findAcrossTenants: (filter, opts = {}) =>
    run(async () =>
      toApiList<B.Subscription>(
        await SubscriptionModel.find(subscriptionQuery(filter)).session(sessionOf(opts.tx) ?? null).lean()
      )
    ),

  updateManyAcrossTenants: (filter, set, opts = {}) =>
    run(async () => {
      const res = await SubscriptionModel.updateMany(subscriptionQuery(filter), toSetUnset(set), {
        session: sessionOf(opts.tx),
      });
      return res.modifiedCount;
    }),

  countActiveByPlanAcrossTenants: () =>
    run(async () => {
      const counts = await SubscriptionModel.aggregate<{ _id: unknown; count: number }>([
        { $match: { status: { $in: ACTIVE_OR_TRIAL } } },
        { $group: { _id: '$planId', count: { $sum: 1 } } },
      ]);
      return Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    }),

  countActiveOnPlanAcrossTenants: (planId) =>
    run(() => SubscriptionModel.countDocuments({ planId, status: { $in: ACTIVE_OR_TRIAL } })),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await SubscriptionModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<B.Subscription>(doc);
    }),

  update: (tenantId, id, ops, opts = {}) =>
    run(async () => {
      const filter = { _id: id, tenantId, ...(opts.ifStatus && { status: opts.ifStatus }) };
      const update = subscriptionUpdateDoc(ops);
      const query = Object.keys(update).length
        ? SubscriptionModel.findOneAndUpdate(filter, update, { new: true, runValidators: true, session: sessionOf(opts.tx) })
        : SubscriptionModel.findOne(filter).session(sessionOf(opts.tx) ?? null);
      return toApiOrNull<B.PopulatedSubscription>(await withPopulate(query, opts.populate).lean());
    }),

  softDeleteAcrossTenants: (id) =>
    run(async () =>
      toApiOrNull<B.Subscription>(
        await SubscriptionModel.findOneAndUpdate(
          { _id: id, isActive: true },
          { isActive: false, status: 'cancelled', cancelledAt: new Date() },
          { new: true }
        ).lean()
      )
    ),

  incrementTransactionsSince: (tenantId, since) =>
    run(async () => {
      const res = await SubscriptionModel.updateOne(
        { tenantId, 'usage.lastResetDate': { $gte: since } },
        { $inc: { 'usage.currentTransactions': 1 } }
      );
      return res.matchedCount > 0;
    }),

  // Only usage.* paths: the model hook then skips the subscription-status cache flush
  setUsage: (tenantId, usage) =>
    run(async () => {
      const $set = Object.fromEntries(
        Object.entries(usage)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [`usage.${k}`, v])
      );
      if (Object.keys($set).length === 0) return;
      await SubscriptionModel.updateOne({ tenantId }, { $set });
    }),
};

// ─── Billing events ─────────────────────────────────────────────────────────

const billingEvents: B.BillingEventRepo = {
  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await BillingEventModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<B.BillingEvent>(doc);
    }),

  createManyAcrossTenants: (events, opts = {}) =>
    run(async () => {
      if (events.length === 0) return;
      await BillingEventModel.insertMany(events, { session: sessionOf(opts.tx) });
    }),

  findByTransactionId: (tenantId, transactionId, scope = {}) =>
    run(async () =>
      toApiOrNull<B.BillingEvent>(
        await BillingEventModel.findOne({
          tenantId,
          transactionId,
          ...(scope.subscriptionId && { subscriptionId: scope.subscriptionId }),
          ...(scope.type && { type: scope.type }),
        }).lean()
      )
    ),

  list: (tenantId, page) =>
    run(async () => {
      const [items, total] = await Promise.all([
        BillingEventModel.find({ tenantId }).sort({ createdAt: -1 }).skip(page.skip).limit(page.limit).lean(),
        BillingEventModel.countDocuments({ tenantId }),
      ]);
      return { items: toApiList<B.BillingEvent>(items), total };
    }),
};

export const mongoBillingRepos: B.BillingRepos = { subscriptionPlans, subscriptions, billingEvents };
