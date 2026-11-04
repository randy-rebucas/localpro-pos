/**
 * Mongo implementation of the sales repositories (lib/db/sales.ts). The
 * queries are the ones the routes ran before; atomic claims stay single
 * conditional writes.
 */
import mongoose from 'mongoose';
import TransactionModel from '@/models/Transaction';
import PaymentModel from '@/models/Payment';
import InvoiceModel from '@/models/Invoice';
import OfflineTransactionModel from '@/models/OfflineTransaction';
import SavedCartModel from '@/models/SavedCart';
import PosSessionModel from '@/models/PosSession';
import StockMovementModel from '@/models/StockMovement';
import PrescriptionModel from '@/models/Prescription';
import TenantEcommerceIntegrationModel from '@/models/TenantEcommerceIntegration';
import '@/models/User'; // registers the schemas for populate()
import '@/models/Customer';
import '@/models/Product';
import type * as S from '../sales';
import { isDuplicateKeyError } from '../errors';
import { applyPatch, definedOnly, escapeRegex, run, sessionOf } from './helpers';
import { toApi, toApiList, toApiOrNull } from './serialize';

const USER_FIELDS = 'name email';

function rangeQuery(range: { gt?: Date; gte?: Date; lt?: Date; lte?: Date }) {
  return Object.fromEntries(
    (['gt', 'gte', 'lt', 'lte'] as const).filter((k) => range[k] !== undefined).map((k) => [`$${k}`, range[k]])
  );
}

// ─── Transactions ───────────────────────────────────────────────────────────

function transactionQuery(f: S.TransactionFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (f.status) q.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
  if (f.isActive !== undefined) q.isActive = f.isActive;
  if (f.notDisabled) q.isActive = { $ne: false };
  if (f.customerId) q.customerId = f.customerId;
  if (f.userId) q.userId = f.userId;
  if (f.paymentMethod) q.paymentMethod = f.paymentMethod;
  if (f.productId) q['items.product'] = f.productId;
  if (f.createdAt) q.createdAt = rangeQuery(f.createdAt);
  if (f.salesChannel) q.salesChannel = f.salesChannel;
  if (f.externalOrderId) q.externalOrderId = f.externalOrderId;
  if (f.notesContain) q.notes = { $regex: escapeRegex(f.notesContain), $options: 'i' };
  return q;
}

function listTransactions(query: Record<string, unknown>, opts: { select?: string; sort?: string; page?: { skip: number; limit: number }; limit?: number }) {
  const find = TransactionModel.find(query);
  if (opts.select) find.select(opts.select);
  if (opts.sort) find.sort({ createdAt: opts.sort === 'createdAt' ? 1 : -1 });
  if (opts.page) find.skip(opts.page.skip).limit(opts.page.limit);
  if (opts.limit) find.limit(opts.limit);
  return find.lean();
}

const transactions: S.TransactionRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () =>
      toApiList<S.Transaction>(await listTransactions({ tenantId, ...transactionQuery(filter) }, opts))
    ),

  listWithRefs: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<S.TransactionWithRefs>(
        await TransactionModel.find({ tenantId, ...transactionQuery(filter) })
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          // items[].name is stored on each line, so items.product isn't populated
          // (clients expect it as an id string)
          .populate('customerId', 'firstName lastName')
          .populate('userId', USER_FIELDS)
          .lean()
      )
    ),

  listAcrossTenants: (filter, opts = {}) =>
    run(async () => toApiList<S.Transaction>(await listTransactions(transactionQuery(filter), opts))),

  count: (tenantId, filter) =>
    run(() => TransactionModel.countDocuments({ tenantId, ...transactionQuery(filter) })),

  countAcrossTenants: (filter) => run(() => TransactionModel.countDocuments(transactionQuery(filter))),

  findOne: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = TransactionModel.findOne({ tenantId, ...transactionQuery(filter) });
      if (opts.select) query.select(opts.select);
      if (opts.sort) query.sort({ createdAt: -1 });
      return toApiOrNull<S.Transaction>(await query.lean());
    }),

  findById: (tenantId, id, opts = {}) =>
    run(async () => {
      const query = TransactionModel.findOne({ _id: id, tenantId, ...(opts.status && { status: opts.status }) });
      if (opts.select) query.select(opts.select);
      return toApiOrNull<S.Transaction>(await query.lean());
    }),

  findDetail: (tenantId, id) =>
    run(async () =>
      toApiOrNull<S.TransactionDetail>(
        await TransactionModel.findOne({ _id: id, tenantId, isActive: { $ne: false } })
          .populate('items.product', 'name sku')
          .populate('userId', USER_FIELDS)
          .lean()
      )
    ),

  findByIdAcrossTenants: (id) =>
    run(async () => toApiOrNull<S.Transaction>(await TransactionModel.findById(id).lean())),

  findByIdempotencyKey: (tenantId, key) =>
    run(async () => toApiOrNull<S.Transaction>(await TransactionModel.findOne({ tenantId, idempotencyKey: key }).lean())),

  findByChannelSyncKey: (tenantId, key) =>
    run(async () => toApiOrNull<S.Transaction>(await TransactionModel.findOne({ tenantId, channelSyncKey: key }).lean())),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await TransactionModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<S.Transaction>(doc);
    }),

  setLoyaltyPoints: (tenantId, id, points, opts = {}) =>
    run(async () => {
      await TransactionModel.updateOne({ _id: id, tenantId }, { $set: points }, { session: sessionOf(opts.tx) });
    }),

  claimStatus: (tenantId, id, from, to, opts = {}) =>
    run(async () =>
      toApiOrNull<S.Transaction>(
        await TransactionModel.findOneAndUpdate(
          { _id: id, tenantId, status: from },
          { $set: { status: to } },
          { new: true, session: sessionOf(opts.tx) }
        ).lean()
      )
    ),

  markShopifyFulfilled: (tenantId, externalOrderId, fulfillmentId, at) =>
    run(async () => {
      await TransactionModel.updateOne(
        { tenantId, externalOrderId, salesChannel: 'shopify' },
        { $set: { shopifyFulfilledAt: at, shopifyFulfillmentId: fulfillmentId } }
      );
    }),
};

// ─── Payments ───────────────────────────────────────────────────────────────

function paymentQuery(tenantId: string, f: S.PaymentFilter = {}): Record<string, unknown> {
  return {
    tenantId,
    ...(f.status && { status: f.status }),
    ...(f.method && { method: f.method }),
    ...(f.transactionId && { transactionId: f.transactionId }),
    ...(f.notDisabled && { isActive: { $ne: false } }),
  };
}

const payments: S.PaymentRepo = {
  list: (tenantId, filter, opts = {}) =>
    run(async () => {
      const query = PaymentModel.find(paymentQuery(tenantId, filter));
      if (opts.select) query.select(opts.select);
      return toApiList<S.Payment>(await query.lean());
    }),

  listWithRefs: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<S.PaymentWithRefs>(
        await PaymentModel.find(paymentQuery(tenantId, filter))
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .populate('transactionId', 'receiptNumber total')
          .populate('processedBy', USER_FIELDS)
          .lean()
      )
    ),

  count: (tenantId, filter) => run(() => PaymentModel.countDocuments(paymentQuery(tenantId, filter))),

  findOne: (tenantId, filter, opts = {}) =>
    run(async () =>
      toApiOrNull<S.Payment>(
        await PaymentModel.findOne(paymentQuery(tenantId, filter)).session(sessionOf(opts.tx) ?? null).lean()
      )
    ),

  findById: (tenantId, id) =>
    run(async () => toApiOrNull<S.Payment>(await PaymentModel.findOne({ _id: id, tenantId }).lean())),

  create: (tenantId, input, opts = {}) =>
    run(async () => {
      const [doc] = await PaymentModel.create([{ ...input, tenantId }], { session: sessionOf(opts.tx) });
      return toApi<S.Payment>(doc);
    }),

  markRefunded: (tenantId, id, refund, opts = {}) =>
    run(async () =>
      toApiOrNull<S.Payment>(
        await PaymentModel.findOneAndUpdate(
          { _id: id, tenantId, status: { $ne: 'refunded' } },
          {
            $set: {
              status: 'refunded',
              refundedAt: refund.at,
              ...(refund.reason ? { refundReason: refund.reason } : {}),
            },
          },
          { new: true, session: sessionOf(opts.tx) }
        ).lean()
      )
    ),
};

// ─── Invoices ───────────────────────────────────────────────────────────────

function invoiceQuery(tenantId: string, f: S.InvoiceFilter = {}): Record<string, unknown> {
  const q: Record<string, unknown> = { tenantId };
  if (f.status) q.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
  if (f.customerId) q.customerId = f.customerId;
  if (f.dueDate) q.dueDate = rangeQuery(f.dueDate);
  if (f.notDisabled) q.isActive = { $ne: false };
  return q;
}

const invoices: S.InvoiceRepo = {
  listWithRefs: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<S.InvoiceWithRefs>(
        await InvoiceModel.find(invoiceQuery(tenantId, filter))
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .populate('transactionId', 'receiptNumber total')
          .populate('customerId', 'name email phone')
          .lean()
      )
    ),

  count: (tenantId, filter) => run(() => InvoiceModel.countDocuments(invoiceQuery(tenantId, filter))),

  findById: (tenantId, id) =>
    run(async () => toApiOrNull<S.Invoice>(await InvoiceModel.findOne({ _id: id, tenantId }).lean())),

  findDetail: (tenantId, id) =>
    run(async () =>
      toApiOrNull<S.InvoiceWithRefs>(
        await InvoiceModel.findOne({ _id: id, tenantId })
          .populate('transactionId', 'receiptNumber total items')
          .populate('customerId', 'name email phone address')
          .lean()
      )
    ),

  create: (tenantId, input) =>
    run(async () => {
      const doc = await InvoiceModel.create({ ...input, tenantId });
      return toApi<S.Invoice>(doc);
    }),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await InvoiceModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<S.Invoice>(doc, patch) : null;
    }),
};

// ─── Offline transactions ───────────────────────────────────────────────────

const SYNCABLE = ['pending', 'failed'];

const offlineTransactions: S.OfflineTransactionRepo = {
  listSyncable: (tenantId, opts) =>
    run(async () =>
      toApiList<S.OfflineTransaction>(
        await OfflineTransactionModel.find({
          tenantId,
          syncStatus: { $in: SYNCABLE },
          retryCount: { $lt: opts.maxRetries },
          isActive: true,
        })
          .sort({ offlineCreatedAt: 1 })
          .limit(opts.limit)
          .lean()
      )
    ),

  claimForSync: (tenantId, id) =>
    run(async () => {
      const claimed = await OfflineTransactionModel.findOneAndUpdate(
        { _id: id, tenantId, syncStatus: { $in: SYNCABLE } },
        { $set: { syncStatus: 'processing' } },
        { projection: { _id: 1 } }
      ).lean();
      return !!claimed;
    }),

  markSynced: (tenantId, id, transactionId) =>
    run(async () => {
      await OfflineTransactionModel.updateOne(
        { _id: id, tenantId },
        { $set: { syncStatus: 'synced', syncedTransactionId: transactionId }, $unset: { syncError: 1 } }
      );
    }),

  recordSyncFailure: (tenantId, id, failure) =>
    run(async () => {
      await OfflineTransactionModel.updateOne(
        { _id: id, tenantId },
        { $set: { syncStatus: failure.status, retryCount: failure.retryCount, syncError: failure.error } }
      );
    }),
};

// ─── Saved carts ────────────────────────────────────────────────────────────

const savedCarts: S.SavedCartRepo = {
  listForUser: (tenantId, userId) =>
    run(async () =>
      toApiList<S.SavedCart>(
        await SavedCartModel.find({ tenantId, userId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean()
      )
    ),

  findForUser: (tenantId, userId, id) =>
    run(async () => toApiOrNull<S.SavedCart>(await SavedCartModel.findOne({ _id: id, tenantId, userId }).lean())),

  create: (tenantId, input) =>
    run(async () => {
      const doc = await SavedCartModel.create({ ...input, tenantId });
      return toApi<S.SavedCart>(doc);
    }),

  deactivate: (tenantId, userId, id) =>
    run(async () => {
      const doc = await SavedCartModel.findOneAndUpdate(
        { _id: id, tenantId, userId, isActive: true },
        { isActive: false },
        { new: true }
      );
      return !!doc;
    }),

  listUpdatedBetween: (tenantId, range, opts) =>
    run(async () =>
      toApiList<S.SavedCartWithUser>(
        await SavedCartModel.find({
          tenantId,
          isActive: { $ne: false }, // skip soft-deleted carts
          updatedAt: { $gt: range.after, $lte: range.upTo },
        })
          .select('userId items total updatedAt')
          .populate('userId', USER_FIELDS)
          .sort({ updatedAt: -1 })
          .limit(opts.limit)
          .lean()
      )
    ),
};

// ─── POS sessions ───────────────────────────────────────────────────────────

const posSessions: S.PosSessionRepo = {
  find: (tenant, sessionId) =>
    run(async () => toApiOrNull<S.PosSession>(await PosSessionModel.findOne({ sessionId, tenant }).lean())),

  update: (tenant, sessionId, set) =>
    run(async () =>
      toApiOrNull<S.PosSession>(
        await PosSessionModel.findOneAndUpdate({ sessionId, tenant }, { $set: set }, { new: true }).lean()
      )
    ),

  upsert: (tenant, sessionId, set, insertDefaults) =>
    run(async () => {
      try {
        return toApiOrNull<S.PosSession>(
          await PosSessionModel.findOneAndUpdate(
            { sessionId, tenant },
            { $set: set, ...(insertDefaults && { $setOnInsert: insertDefaults }) },
            { upsert: true, new: true }
          ).lean()
        );
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        // sessionId already exists: either another tenant owns it (no match →
        // null) or a concurrent request of this tenant created it first
        return toApiOrNull<S.PosSession>(
          await PosSessionModel.findOneAndUpdate({ sessionId, tenant }, { $set: set }, { new: true }).lean()
        );
      }
    }),
};

// ─── Stock movements ────────────────────────────────────────────────────────

function stockMovementQuery(tenantId: string, f: S.StockMovementFilter = {}): Record<string, unknown> {
  return {
    tenantId,
    ...(f.productId && { productId: f.productId }),
    ...(f.branchId && { branchId: f.branchId }),
    ...(f.type && { type: f.type }),
    ...(f.createdAt && { createdAt: rangeQuery(f.createdAt) }),
  };
}

const stockMovements: S.StockMovementRepo = {
  list: (tenantId, filter, opts) =>
    run(async () => {
      const query = StockMovementModel.find(stockMovementQuery(tenantId, filter)).sort({ createdAt: -1 }).limit(opts.limit);
      if (opts.select) query.select(opts.select);
      return toApiList<S.StockMovement>(await query.lean());
    }),

  listWithRefs: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<S.StockMovementWithRefs>(
        await StockMovementModel.find(stockMovementQuery(tenantId, filter))
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .populate('productId', 'name sku')
          .populate('userId', USER_FIELDS)
          .populate('transactionId', 'receiptNumber')
          .lean()
      )
    ),

  count: (tenantId, filter) => run(() => StockMovementModel.countDocuments(stockMovementQuery(tenantId, filter))),

  createMany: (movements, opts = {}) =>
    run(async () => {
      if (movements.length === 0) return;
      await StockMovementModel.insertMany(movements, { session: sessionOf(opts.tx) });
    }),
};

// ─── Prescriptions ──────────────────────────────────────────────────────────

function prescriptionQuery(tenantId: string, f: S.PrescriptionFilter = {}): Record<string, unknown> {
  return {
    tenantId,
    ...(f.status && { status: f.status }),
    ...(f.search && { $text: { $search: f.search } }),
  };
}

const prescriptions: S.PrescriptionRepo = {
  list: (tenantId, filter, opts) =>
    run(async () =>
      toApiList<S.Prescription>(
        await PrescriptionModel.find(prescriptionQuery(tenantId, filter))
          .sort({ createdAt: -1 })
          .skip(opts.page.skip)
          .limit(opts.page.limit)
          .lean()
      )
    ),

  count: (tenantId, filter) => run(() => PrescriptionModel.countDocuments(prescriptionQuery(tenantId, filter))),

  findById: (tenantId, id) =>
    run(async () => toApiOrNull<S.Prescription>(await PrescriptionModel.findOne({ _id: id, tenantId }).lean())),

  findLastNumber: (tenantId, year) =>
    run(async () => {
      const last = await PrescriptionModel.findOne(
        { tenantId, prescriptionNumber: new RegExp(`^RX-${year}-`) },
        { prescriptionNumber: 1 },
        { sort: { prescriptionNumber: -1 } }
      ).lean();
      return last?.prescriptionNumber ?? null;
    }),

  create: (tenantId, input) =>
    run(async () => {
      const doc = await PrescriptionModel.create({ ...input, tenantId });
      return toApi<S.Prescription>(doc);
    }),

  update: (tenantId, id, patch) =>
    run(async () => {
      const doc = await PrescriptionModel.findOne({ _id: id, tenantId });
      return doc ? applyPatch<S.Prescription>(doc, patch) : null;
    }),

  dispenseItems: (tenantId, id, itemIndexes, dispense, opts = {}) =>
    run(async () => {
      const session = sessionOf(opts.tx);
      const doc = await PrescriptionModel.findOne({ _id: id, tenantId }).session(session ?? null);
      if (!doc || ['dispensed', 'cancelled'].includes(doc.status)) return null;
      if (itemIndexes.some((idx) => doc.items[idx]?.dispensed !== false)) return null;

      for (const idx of itemIndexes) {
        doc.items[idx].dispensed = true;
        doc.items[idx].dispensedAt = dispense.at;
        doc.items[idx].dispensedBy = new mongoose.Types.ObjectId(dispense.by);
      }
      doc.status = doc.items.every((item) => item.dispensed) ? 'dispensed' : 'partially_dispensed';
      await doc.save({ session });
      return toApi<S.Prescription>(doc);
    }),
};

// ─── E-commerce integrations ────────────────────────────────────────────────

const ecommerceIntegrations: S.EcommerceIntegrationRepo = {
  listActive: (tenantId) =>
    run(async () =>
      toApiList<S.EcommerceIntegration>(await TenantEcommerceIntegrationModel.find({ tenantId, isActive: true }).lean())
    ),

  hasActive: (tenantId) =>
    run(async () => Boolean(await TenantEcommerceIntegrationModel.exists({ tenantId, isActive: true }))),

  findActive: (tenantId, provider) =>
    run(async () =>
      toApiOrNull<S.EcommerceIntegration>(
        await TenantEcommerceIntegrationModel.findOne({ tenantId, provider, isActive: true }).lean()
      )
    ),

  findActiveByShopDomainAcrossTenants: (shopDomain) =>
    run(async () =>
      toApiOrNull<S.EcommerceIntegration>(
        await TenantEcommerceIntegrationModel.findOne({ provider: 'shopify', shopDomain, isActive: true }).lean()
      )
    ),

  findByIdAcrossTenants: (id) =>
    run(async () =>
      toApiOrNull<S.EcommerceIntegration>(await TenantEcommerceIntegrationModel.findById(id).lean())
    ),

  upsert: (tenantId, provider, set) =>
    run(async () =>
      toApi<S.EcommerceIntegration>(
        await TenantEcommerceIntegrationModel.findOneAndUpdate(
          { tenantId, provider },
          { $set: definedOnly(set), $setOnInsert: { tenantId, provider } },
          { upsert: true, new: true }
        ).lean()
      )
    ),

  update: (tenantId, provider, set) =>
    run(async () => {
      await TenantEcommerceIntegrationModel.updateOne({ tenantId, provider }, { $set: definedOnly(set) });
    }),

  delete: (tenantId, provider) =>
    run(async () => {
      await TenantEcommerceIntegrationModel.deleteMany({ tenantId, provider });
    }),
};

// ─── Counters ───────────────────────────────────────────────────────────────

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "REC-20241118-tenantId" or "INV-20241118-tenantId"
  seq: { type: Number, default: 0 },
});

const CounterModel = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

const counters: S.CounterRepo = {
  next: (key) =>
    run(async () => {
      const result = await CounterModel.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
      return result.seq as number;
    }),
};

export const mongoSalesRepos: S.SalesRepos = {
  transactions,
  payments,
  invoices,
  offlineTransactions,
  savedCarts,
  posSessions,
  stockMovements,
  prescriptions,
  ecommerceIntegrations,
  counters,
};
