/**
 * Mongo sales repositories: tenant scoping, filter translation, the atomic
 * claims, and the rules that moved out of the routes (POS session ownership,
 * prescription dispensing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

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
import { mongoSalesRepos as repos } from '@/lib/db/mongo/sales';
import { DuplicateKeyError } from '@/lib/db/errors';
import type { DbTx } from '@/lib/db/tx';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const USER = '64abc123def4567890abc111';
const now = new Date('2026-11-01T00:00:00Z');
const session = { id: 'session' } as never;
const tx: DbTx = { driver: 'mongo', session };

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

const lastArgs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls[spy.mock.calls.length - 1];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('sales methods scope by tenant', () => {
  it('reads and counts', async () => {
    const spies = [
      vi.spyOn(TransactionModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(TransactionModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(TransactionModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(PaymentModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(PaymentModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(PaymentModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(InvoiceModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(InvoiceModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(InvoiceModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(OfflineTransactionModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(SavedCartModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(SavedCartModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(StockMovementModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(StockMovementModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(PrescriptionModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(PrescriptionModel, 'findOne').mockReturnValue(leanQuery(null) as never),
      vi.spyOn(PrescriptionModel, 'countDocuments').mockResolvedValue(0 as never),
      vi.spyOn(TenantEcommerceIntegrationModel, 'find').mockReturnValue(leanQuery([]) as never),
      vi.spyOn(TenantEcommerceIntegrationModel, 'findOne').mockReturnValue(leanQuery(null) as never),
    ];
    const page = { skip: 0, limit: 10 };

    await repos.transactions.list(TENANT, { status: 'completed' });
    await repos.transactions.listWithRefs(TENANT, {}, { page });
    await repos.transactions.count(TENANT);
    await repos.transactions.findOne(TENANT, { productId: ID });
    await repos.transactions.findById(TENANT, ID);
    await repos.transactions.findDetail(TENANT, ID);
    await repos.transactions.findByIdempotencyKey(TENANT, 'key');
    await repos.transactions.findByChannelSyncKey(TENANT, 'shopify:1');
    await repos.payments.list(TENANT, {});
    await repos.payments.listWithRefs(TENANT, {}, { page });
    await repos.payments.count(TENANT);
    await repos.payments.findOne(TENANT, {});
    await repos.payments.findById(TENANT, ID);
    await repos.invoices.listWithRefs(TENANT, {}, { page });
    await repos.invoices.count(TENANT);
    await repos.invoices.findById(TENANT, ID);
    await repos.invoices.findDetail(TENANT, ID);
    await repos.offlineTransactions.listSyncable(TENANT, { maxRetries: 3, limit: 100 });
    await repos.savedCarts.listForUser(TENANT, USER);
    await repos.savedCarts.findForUser(TENANT, USER, ID);
    await repos.savedCarts.listUpdatedBetween(TENANT, { after: now, upTo: now }, { limit: 100 });
    await repos.stockMovements.list(TENANT, {}, { limit: 50 });
    await repos.stockMovements.listWithRefs(TENANT, {}, { page });
    await repos.stockMovements.count(TENANT);
    await repos.prescriptions.list(TENANT, {}, { page });
    await repos.prescriptions.count(TENANT);
    await repos.prescriptions.findById(TENANT, ID);
    await repos.prescriptions.findLastNumber(TENANT, 2026);
    await repos.ecommerceIntegrations.listActive(TENANT);
    await repos.ecommerceIntegrations.findActive(TENANT, 'shopify');

    for (const spy of spies) {
      expect(spy).toHaveBeenCalled();
      for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
    }
  });

  it('creates cannot be redirected to another tenant by the input', async () => {
    const transaction = vi.spyOn(TransactionModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    const payment = vi.spyOn(PaymentModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    const invoice = vi.spyOn(InvoiceModel, 'create').mockResolvedValue({ _id: ID } as never);
    const cart = vi.spyOn(SavedCartModel, 'create').mockResolvedValue({ _id: ID } as never);
    const prescription = vi.spyOn(PrescriptionModel, 'create').mockResolvedValue({ _id: ID } as never);

    await repos.transactions.create(TENANT, { tenantId: 'other' } as never);
    await repos.payments.create(TENANT, { tenantId: 'other' } as never);
    await repos.invoices.create(TENANT, { tenantId: 'other' } as never);
    await repos.savedCarts.create(TENANT, { tenantId: 'other' } as never);
    await repos.prescriptions.create(TENANT, { tenantId: 'other' } as never);

    expect((transaction.mock.calls[0][0] as unknown as unknown[])[0]).toMatchObject({ tenantId: TENANT });
    expect((payment.mock.calls[0][0] as unknown as unknown[])[0]).toMatchObject({ tenantId: TENANT });
    expect(invoice.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
    expect(cart.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
    expect(prescription.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });

  it('writes include the tenant in the filter', async () => {
    const update = vi.spyOn(TransactionModel, 'updateOne').mockResolvedValue({} as never);
    const offline = vi.spyOn(OfflineTransactionModel, 'updateOne').mockResolvedValue({} as never);
    const integration = vi.spyOn(TenantEcommerceIntegrationModel, 'updateOne').mockResolvedValue({} as never);
    const remove = vi.spyOn(TenantEcommerceIntegrationModel, 'deleteMany').mockResolvedValue({} as never);

    await repos.transactions.setLoyaltyPoints(TENANT, ID, { loyaltyPointsEarned: 5 });
    await repos.transactions.markShopifyFulfilled(TENANT, 'order-1', 'f-1', now);
    await repos.offlineTransactions.markSynced(TENANT, ID, ID);
    await repos.ecommerceIntegrations.update(TENANT, 'shopify', { lastError: 'x' });
    await repos.ecommerceIntegrations.delete(TENANT, 'shopify');

    for (const spy of [update, offline, integration, remove]) {
      for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
    }
    expect(update.mock.calls[1][0]).toEqual({ tenantId: TENANT, externalOrderId: 'order-1', salesChannel: 'shopify' });
  });
});

describe('transactions', () => {
  it('translates the filter', async () => {
    const find = vi.spyOn(TransactionModel, 'find').mockReturnValue(leanQuery([]) as never);

    await repos.transactions.list(TENANT, {
      status: ['cancelled', 'refunded'],
      notDisabled: true,
      productId: ID,
      paymentMethod: 'cash',
      createdAt: { gte: now, lt: now },
      notesContain: 'a.b',
    });

    expect(lastArgs(find)[0]).toEqual({
      tenantId: TENANT,
      status: { $in: ['cancelled', 'refunded'] },
      isActive: { $ne: false },
      'items.product': ID,
      paymentMethod: 'cash',
      createdAt: { $gte: now, $lt: now },
      // Literal match: the dot isn't a regex wildcard
      notes: { $regex: 'a\\.b', $options: 'i' },
    });
  });

  it('applies select, sort and limit only when asked', async () => {
    const query = leanQuery([]);
    vi.spyOn(TransactionModel, 'find').mockReturnValue(query as never);

    await repos.transactions.list(TENANT, {}, { select: 'total', sort: 'createdAt', limit: 5 });
    expect(query.select).toHaveBeenCalledWith('total');
    expect(query.sort).toHaveBeenCalledWith({ createdAt: 1 });
    expect(query.limit).toHaveBeenCalledWith(5);

    const plain = leanQuery([]);
    vi.spyOn(TransactionModel, 'find').mockReturnValue(plain as never);
    await repos.transactions.list(TENANT);
    expect(plain.sort).not.toHaveBeenCalled();
    expect(plain.limit).not.toHaveBeenCalled();
  });

  it('across-tenant reads have no tenant condition', async () => {
    const find = vi.spyOn(TransactionModel, 'find').mockReturnValue(leanQuery([]) as never);
    const count = vi.spyOn(TransactionModel, 'countDocuments').mockResolvedValue(3 as never);

    await repos.transactions.listAcrossTenants({ status: 'completed' });
    await repos.transactions.countAcrossTenants({ status: 'completed', isActive: true });

    expect(lastArgs(find)[0]).toEqual({ status: 'completed' });
    expect(lastArgs(count)[0]).toEqual({ status: 'completed', isActive: true });
  });

  it('claimStatus only matches the expected status and joins the transaction', async () => {
    const claim = vi.spyOn(TransactionModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID }) as never);

    await repos.transactions.claimStatus(TENANT, ID, 'completed', 'refunded', { tx });

    expect(lastArgs(claim)).toEqual([
      { _id: ID, tenantId: TENANT, status: 'completed' },
      { $set: { status: 'refunded' } },
      { new: true, session },
    ]);
  });

  it('claimStatus returns null when another request won', async () => {
    vi.spyOn(TransactionModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    await expect(repos.transactions.claimStatus(TENANT, ID, 'completed', 'cancelled')).resolves.toBeNull();
  });

  it('translates a duplicate receipt number and keeps the field', async () => {
    const dup = Object.assign(new Error('E11000'), { code: 11000, keyPattern: { tenantId: 1, receiptNumber: 1 } });
    vi.spyOn(TransactionModel, 'create').mockRejectedValue(dup as never);

    const err = await repos.transactions.create(TENANT, {} as never).catch((e) => e);

    expect(err).toBeInstanceOf(DuplicateKeyError);
    expect(err.field).toBe('receiptNumber');
  });
});

describe('payments', () => {
  it('markRefunded can only claim an unrefunded payment', async () => {
    const claim = vi.spyOn(PaymentModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID }) as never);

    await repos.payments.markRefunded(TENANT, ID, { at: now, reason: 'damaged' }, { tx });

    expect(lastArgs(claim)).toEqual([
      { _id: ID, tenantId: TENANT, status: { $ne: 'refunded' } },
      { $set: { status: 'refunded', refundedAt: now, refundReason: 'damaged' } },
      { new: true, session },
    ]);
  });

  it('markRefunded leaves the reason out when none is given', async () => {
    const claim = vi.spyOn(PaymentModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);

    await expect(repos.payments.markRefunded(TENANT, ID, { at: now })).resolves.toBeNull();

    expect((lastArgs(claim)[1] as { $set: object }).$set).toEqual({ status: 'refunded', refundedAt: now });
  });
});

describe('invoices', () => {
  it('translates the overdue filter', async () => {
    const find = vi.spyOn(InvoiceModel, 'find').mockReturnValue(leanQuery([]) as never);

    await repos.invoices.listWithRefs(
      TENANT,
      { status: ['sent', 'draft'], dueDate: { lt: now }, notDisabled: true },
      { page: { skip: 0, limit: 10 } }
    );

    expect(lastArgs(find)[0]).toEqual({
      tenantId: TENANT,
      status: { $in: ['sent', 'draft'] },
      dueDate: { $lt: now },
      isActive: { $ne: false },
    });
  });
});

describe('offline transactions', () => {
  it('claims a row only while it is syncable', async () => {
    const claim = vi.spyOn(OfflineTransactionModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);

    await expect(repos.offlineTransactions.claimForSync(TENANT, ID)).resolves.toBe(false);

    expect(lastArgs(claim)[0]).toEqual({ _id: ID, tenantId: TENANT, syncStatus: { $in: ['pending', 'failed'] } });
  });
});

describe('saved carts', () => {
  it('deactivate is scoped to the owner', async () => {
    const update = vi.spyOn(SavedCartModel, 'findOneAndUpdate').mockResolvedValue(null as never);

    await expect(repos.savedCarts.deactivate(TENANT, USER, ID)).resolves.toBe(false);

    expect(lastArgs(update)[0]).toEqual({ _id: ID, tenantId: TENANT, userId: USER, isActive: true });
  });
});

describe('POS sessions', () => {
  const dup = () => Object.assign(new Error('E11000'), { code: 11000, keyPattern: { sessionId: 1 } });

  it('upsert creates with the defaults', async () => {
    const upsert = vi.spyOn(PosSessionModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ sessionId: 's1' }) as never);

    await repos.posSessions.upsert('acme', 's1', { total: 5 }, { tip: 0 });

    expect(lastArgs(upsert)).toEqual([
      { sessionId: 's1', tenant: 'acme' },
      { $set: { total: 5 }, $setOnInsert: { tip: 0 } },
      { upsert: true, new: true },
    ]);
  });

  it('upsert returns null when another tenant owns the session id', async () => {
    const q = leanQuery(null);
    q.lean = vi.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce(null);
    vi.spyOn(PosSessionModel, 'findOneAndUpdate').mockReturnValue(q as never);

    await expect(repos.posSessions.upsert('other', 's1', { total: 5 })).resolves.toBeNull();
  });

  it('upsert updates when a concurrent request of the same tenant created it first', async () => {
    const q = leanQuery(null);
    q.lean = vi.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ sessionId: 's1', total: 5 });
    const spy = vi.spyOn(PosSessionModel, 'findOneAndUpdate').mockReturnValue(q as never);

    await expect(repos.posSessions.upsert('acme', 's1', { total: 5 }, { tip: 0 })).resolves.toMatchObject({ total: 5 });

    expect(lastArgs(spy)).toEqual([{ sessionId: 's1', tenant: 'acme' }, { $set: { total: 5 } }, { new: true }]);
  });

  it('upsert rethrows other errors', async () => {
    const q = leanQuery(null);
    q.lean = vi.fn().mockRejectedValue(new Error('boom'));
    vi.spyOn(PosSessionModel, 'findOneAndUpdate').mockReturnValue(q as never);

    await expect(repos.posSessions.upsert('acme', 's1', {})).rejects.toThrow('boom');
  });
});

describe('stock movements', () => {
  it('createMany writes one batch in the transaction', async () => {
    const insert = vi.spyOn(StockMovementModel, 'insertMany').mockResolvedValue([] as never);
    const movements = [{ tenantId: TENANT, productId: ID, type: 'sale', quantity: -1, previousStock: 5, newStock: 4 }] as never;

    await repos.stockMovements.createMany(movements, { tx });

    expect(lastArgs(insert)).toEqual([movements, { session }]);
  });

  it('createMany skips an empty batch', async () => {
    const insert = vi.spyOn(StockMovementModel, 'insertMany').mockResolvedValue([] as never);
    await repos.stockMovements.createMany([]);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('prescriptions', () => {
  function prescription(status: string, dispensed: boolean[]) {
    const doc = new PrescriptionModel({
      tenantId: TENANT,
      prescriptionNumber: 'RX-2026-000001',
      patientName: 'Patient',
      doctorName: 'Doctor',
      doctorPRCNumber: 'PRC',
      issuedDate: now,
      validUntil: now,
      createdBy: USER,
      status,
      items: dispensed.map((d, i) => ({ drugName: `Drug ${i}`, quantity: 1, dosage: '1', frequency: 'daily', dispensed: d })),
    });
    const save = vi.spyOn(doc, 'save').mockResolvedValue(doc as never);
    const session = vi.fn().mockResolvedValue(doc);
    vi.spyOn(PrescriptionModel, 'findOne').mockReturnValue({ session } as never);
    return { doc, save, session };
  }

  const dispense = { by: USER, at: now };

  it('marks items and leaves the rest pending as partially dispensed', async () => {
    const { save, session: readInTx } = prescription('pending', [false, false]);

    const result = await repos.prescriptions.dispenseItems(TENANT, ID, [0], dispense, { tx });

    expect(result?.status).toBe('partially_dispensed');
    expect(result?.items[0]).toMatchObject({ dispensed: true, dispensedAt: now, dispensedBy: USER });
    expect(result?.items[1].dispensed).toBe(false);
    expect(readInTx).toHaveBeenCalledWith(session);
    expect(save).toHaveBeenCalledWith({ session });
  });

  it('finishes the prescription with the last item', async () => {
    prescription('partially_dispensed', [true, false]);

    const result = await repos.prescriptions.dispenseItems(TENANT, ID, [1], dispense);

    expect(result?.status).toBe('dispensed');
  });

  it('refuses an item a concurrent request already dispensed', async () => {
    const { save } = prescription('partially_dispensed', [true, false]);

    await expect(repos.prescriptions.dispenseItems(TENANT, ID, [0, 1], dispense)).resolves.toBeNull();

    expect(save).not.toHaveBeenCalled();
  });

  it('refuses an index outside the prescription', async () => {
    const { save } = prescription('pending', [false]);

    await expect(repos.prescriptions.dispenseItems(TENANT, ID, [5], dispense)).resolves.toBeNull();

    expect(save).not.toHaveBeenCalled();
  });

  it.each(['dispensed', 'cancelled'])('refuses a %s prescription', async (status) => {
    const { save } = prescription(status, [false]);

    await expect(repos.prescriptions.dispenseItems(TENANT, ID, [0], dispense)).resolves.toBeNull();

    expect(save).not.toHaveBeenCalled();
  });

  it('returns null for a missing prescription', async () => {
    vi.spyOn(PrescriptionModel, 'findOne').mockReturnValue({ session: vi.fn().mockResolvedValue(null) } as never);

    await expect(repos.prescriptions.dispenseItems(TENANT, ID, [0], dispense)).resolves.toBeNull();
  });

  it('findLastNumber reads the highest number of the year', async () => {
    const findOne = vi
      .spyOn(PrescriptionModel, 'findOne')
      .mockReturnValue(leanQuery({ prescriptionNumber: 'RX-2026-000007' }) as never);

    await expect(repos.prescriptions.findLastNumber(TENANT, 2026)).resolves.toBe('RX-2026-000007');

    expect(lastArgs(findOne)[2]).toEqual({ sort: { prescriptionNumber: -1 } });
  });

  it('passes a search to the text index', async () => {
    const count = vi.spyOn(PrescriptionModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.prescriptions.count(TENANT, { search: 'cruz', status: 'pending' });

    expect(lastArgs(count)[0]).toEqual({ tenantId: TENANT, status: 'pending', $text: { $search: 'cruz' } });
  });
});

describe('e-commerce integrations', () => {
  it('upsert drops undefined values, so a stored field stays', async () => {
    const upsert = vi.spyOn(TenantEcommerceIntegrationModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID }) as never);

    await repos.ecommerceIntegrations.upsert(TENANT, 'shopify', { isActive: true, lastError: undefined });

    expect(lastArgs(upsert)).toEqual([
      { tenantId: TENANT, provider: 'shopify' },
      { $set: { isActive: true }, $setOnInsert: { tenantId: TENANT, provider: 'shopify' } },
      { upsert: true, new: true },
    ]);
  });

  it('the shop-domain lookup is limited to active Shopify integrations', async () => {
    const findOne = vi.spyOn(TenantEcommerceIntegrationModel, 'findOne').mockReturnValue(leanQuery(null) as never);

    await repos.ecommerceIntegrations.findActiveByShopDomainAcrossTenants('a.myshopify.com');

    expect(lastArgs(findOne)[0]).toEqual({ provider: 'shopify', shopDomain: 'a.myshopify.com', isActive: true });
  });
});

describe('counters', () => {
  it('increments atomically and creates the key on first use', async () => {
    const CounterModel = mongoose.models.Counter;
    const next = vi.spyOn(CounterModel, 'findOneAndUpdate').mockResolvedValue({ seq: 7 } as never);

    await expect(repos.counters.next('REC-20261101-t1')).resolves.toBe(7);

    expect(lastArgs(next)).toEqual([{ _id: 'REC-20261101-t1' }, { $inc: { seq: 1 } }, { new: true, upsert: true }]);
  });
});
