/**
 * Mongo implementation of the CRM repositories (lib/db/crm.ts).
 */
import mongoose from 'mongoose';
import CustomerModel from '@/models/Customer';
import CustomerBalancePaymentModel from '@/models/CustomerBalancePayment';
import LoyaltyTransactionModel from '@/models/LoyaltyTransaction';
import CampaignModel from '@/models/Campaign';
import type * as R from '../crm';
import { applyPatch, escapeRegex, run, sessionOf } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

// ─── Customers ──────────────────────────────────────────────────────────────

function customerQuery(tenantId: string, f: R.CustomerFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId };
  if (f.ids || f.excludeId) q._id = { ...(f.ids && { $in: f.ids }), ...(f.excludeId && { $ne: f.excludeId }) };
  if (f.isActive !== undefined) q.isActive = f.isActive;
  else if (f.notDisabled) q.isActive = { $ne: false };
  if (f.search) {
    const regex = { $regex: escapeRegex(f.search), $options: 'i' };
    q.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }, { phone: regex }];
  }
  if (f.email !== undefined) q.email = f.email.toLowerCase().trim();
  if (f.phone !== undefined) q.phone = f.phone;
  if (f.hasContact) q[f.hasContact] = { $exists: true, $ne: '' };
  if (f.minLoyaltyPoints !== undefined) q.loyaltyPointsBalance = { $gte: f.minLoyaltyPoints };
  return q;
}

const customers: R.CustomerRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = CustomerModel.find(customerQuery(tenantId, filter)).sort({ createdAt: -1 });
      if (opts.select) query.select(opts.select);
      if (opts.page) query.skip(opts.page.skip).limit(opts.page.limit);
      return toApiList<R.Customer>(await query.lean());
    }),

  count: (tenantId, filter) => run(() => CustomerModel.countDocuments(customerQuery(tenantId, filter))),

  findOne: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = CustomerModel.findOne(customerQuery(tenantId, filter)).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<R.Customer>(await query.lean());
    }),

  findById: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = CustomerModel.findOne({ _id: id, tenantId }).session(sessionOf(opts.tx) ?? null);
      if (opts.select) query.select(opts.select);
      return toApiOrNull<R.Customer>(await query.lean());
    }),

  create: (tenantId, input) => run(async () => toApi<R.Customer>(await CustomerModel.create({ ...input, tenantId }))),

  update: (tenantId, id, patch, opts = {}) =>
    run(async () => {
      const session = sessionOf(opts.tx);
      const doc = await CustomerModel.findOne({ _id: id, tenantId }).session(session ?? null);
      return doc ? applyPatch<R.Customer>(doc, patch, session) : null;
    }),

  adjustAccountBalance: (tenantId, id, delta, opts = {}) =>
    run(async () => {
      await CustomerModel.updateOne({ _id: id, tenantId }, { $inc: { accountBalance: delta } }, { session: sessionOf(opts.tx) });
    }),

  setBalances: (tenantId, id, set, opts = {}) =>
    run(async () => {
      await CustomerModel.updateOne({ _id: id, tenantId }, { $set: set }, { session: sessionOf(opts.tx) });
    }),

  loyaltyStats: (tenantId) =>
    run(async () => {
      // aggregate() doesn't cast: the tenant id must be an ObjectId here
      const [result] = await CustomerModel.aggregate<{ enrolledCount: number; totalPoints: number }>([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), loyaltyPointsBalance: { $gt: 0 } } },
        { $group: { _id: null, enrolledCount: { $sum: 1 }, totalPoints: { $sum: '$loyaltyPointsBalance' } } },
      ]);
      return { enrolledCount: result?.enrolledCount ?? 0, totalPoints: result?.totalPoints ?? 0 };
    }),
};

// ─── Balance payments ───────────────────────────────────────────────────────

const balancePayments: R.BalancePaymentRepo = {
  list: (tenantId, customerId, opts) =>
    run(async () =>
      toApiList<R.BalancePayment>(
        await CustomerBalancePaymentModel.find({ tenantId, customerId }).sort({ createdAt: -1 }).limit(opts.limit).lean()
      )
    ),

  findByIdempotencyKey: (tenantId, key) =>
    run(async () => toApiOrNull<R.BalancePayment>(await CustomerBalancePaymentModel.findOne({ tenantId, idempotencyKey: key }).lean())),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await CustomerBalancePaymentModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<R.BalancePayment>(doc);
    }),
};

// ─── Loyalty transactions ───────────────────────────────────────────────────

const loyaltyTransactions: R.LoyaltyTransactionRepo = {
  list: (tenantId, customerId, opts) =>
    run(async () => {
      const query = LoyaltyTransactionModel.find({ tenantId, customerId })
        .sort({ createdAt: -1 })
        .skip(opts.page.skip)
        .limit(opts.page.limit);
      if (opts.select) query.select(opts.select);
      return toApiList<R.LoyaltyTransaction>(await query.lean());
    }),

  count: (tenantId, customerId) => run(() => LoyaltyTransactionModel.countDocuments({ tenantId, customerId })),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await LoyaltyTransactionModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<R.LoyaltyTransaction>(doc);
    }),
};

// ─── Campaigns ──────────────────────────────────────────────────────────────

const campaigns: R.CampaignRepo = {
  list: (tenantId, opts) =>
    run(async () => toApiList<R.Campaign>(await CampaignModel.find({ tenantId }).sort({ createdAt: -1 }).limit(opts.limit).lean())),

  exists: (tenantId, id) => run(async () => !!(await CampaignModel.exists({ _id: id, tenantId }))),

  create: (tenantId, input) => run(async () => toApi<R.Campaign>(await CampaignModel.create({ ...input, tenantId }))),

  claimForSending: (tenantId, id) =>
    run(async () =>
      toApiOrNull<R.Campaign>(
        await CampaignModel.findOneAndUpdate(
          { _id: id, tenantId, status: { $in: ['draft', 'failed'] } },
          { $set: { status: 'sent' } },
          { new: true }
        ).lean()
      )
    ),

  recordSendResult: (tenantId, id, result) =>
    run(async () =>
      toApiOrNull<R.Campaign>(
        await CampaignModel.findOneAndUpdate({ _id: id, tenantId }, { $set: result }, { new: true, runValidators: true }).lean()
      )
    ),
};

export const mongoCrmRepos: R.CrmRepos = { customers, balancePayments, loyaltyTransactions, campaigns };
