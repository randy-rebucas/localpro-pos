/**
 * Mongo billing repositories: tenant scoping of subscription and billing-event
 * methods, and the translation of filters/updates into Mongo queries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

import SubscriptionModel from '@/models/Subscription';
import SubscriptionPlanModel from '@/models/SubscriptionPlan';
import BillingEventModel from '@/models/BillingEvent';
import { mongoBillingRepos as repos } from '@/lib/db/mongo/billing';

const TENANT = '64abc123def4567890abcdef';
const ID = '64abc123def4567890abc000';
const now = new Date('2026-11-01T00:00:00Z');

function leanQuery(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'populate', 'sort', 'skip', 'limit', 'session']) q[m] = vi.fn(() => q);
  q.lean = vi.fn().mockResolvedValue(result);
  return q;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('subscription and billing-event methods scope by tenant', () => {
  it.each([
    ['findByTenant', () => repos.subscriptions.findByTenant(TENANT, { status: ['active', 'trial'] })],
    ['findById', () => repos.subscriptions.findById(TENANT, ID)],
    ['findUsage', () => repos.subscriptions.findUsage(TENANT)],
  ])('subscriptions.%s', async (_name, call) => {
    const spy = vi.spyOn(SubscriptionModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    await call();
    expect(spy.mock.calls[0][0]).toMatchObject({ tenantId: TENANT });
  });

  it('subscriptions.update filters by tenant (and id)', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'findOneAndUpdate').mockReturnValue(leanQuery(null) as never);
    await repos.subscriptions.update(TENANT, ID, { set: { autoRenew: false } });
    expect(spy.mock.calls[0][0]).toEqual({ _id: ID, tenantId: TENANT });
  });

  it('subscriptions.create cannot be redirected to another tenant by the input', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    await repos.subscriptions.create(TENANT, { planId: ID, tenantId: 'other' } as never);
    expect((spy.mock.calls[0][0] as unknown as Record<string, unknown>[])[0]).toMatchObject({ tenantId: TENANT });
  });

  it('usage counters are scoped by tenant', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await repos.subscriptions.incrementTransactionsSince(TENANT, now);
    await repos.subscriptions.setUsage(TENANT, { currentUsers: 3 });
    for (const [filter] of spy.mock.calls) expect(filter).toMatchObject({ tenantId: TENANT });
  });

  it('billing events are scoped by tenant', async () => {
    const create = vi.spyOn(BillingEventModel, 'create').mockResolvedValue([{ _id: ID }] as never);
    const findOne = vi.spyOn(BillingEventModel, 'findOne').mockReturnValue(leanQuery(null) as never);
    const find = vi.spyOn(BillingEventModel, 'find').mockReturnValue(leanQuery([]) as never);
    const count = vi.spyOn(BillingEventModel, 'countDocuments').mockResolvedValue(0 as never);

    await repos.billingEvents.create(TENANT, { subscriptionId: ID, type: 'payment_received', amount: 1, tenantId: 'other' } as never);
    await repos.billingEvents.findByTransactionId(TENANT, 'PAY-1', { type: 'payment_received' });
    await repos.billingEvents.list(TENANT, { skip: 0, limit: 20 });

    expect((create.mock.calls[0][0] as unknown as Record<string, unknown>[])[0]).toMatchObject({ tenantId: TENANT });
    expect(findOne.mock.calls[0][0]).toEqual({ tenantId: TENANT, transactionId: 'PAY-1', type: 'payment_received' });
    expect((find.mock.calls[0] as unknown[])[0]).toEqual({ tenantId: TENANT });
    expect(count.mock.calls[0][0]).toEqual({ tenantId: TENANT });
  });
});

describe('subscriptions.update translates SubscriptionUpdate', () => {
  async function capture(...args: Parameters<typeof repos.subscriptions.update>) {
    const spy = vi.spyOn(SubscriptionModel, 'findOneAndUpdate').mockReturnValue(leanQuery({ _id: ID }) as never);
    await repos.subscriptions.update(...args);
    return spy.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
  }

  it('set, null-clears and an appended billing entry, with validators', async () => {
    const entry = { date: now, amount: 50, status: 'pending' as const };
    const [, update, options] = await capture(TENANT, ID, {
      set: { paymentOverdue: false, deactivatedAt: null, cancellationReason: undefined },
      addBillingEntry: entry,
    });
    expect(update).toEqual({
      $set: { paymentOverdue: false },
      $unset: { deactivatedAt: 1 },
      $push: { billingHistory: entry },
    });
    expect(options).toMatchObject({ new: true, runValidators: true });
  });

  it('ifStatus becomes a precondition in the filter', async () => {
    const [filter] = await capture(TENANT, ID, { set: { status: 'cancelled' } }, { ifStatus: 'active' });
    expect(filter).toEqual({ _id: ID, tenantId: TENANT, status: 'active' });
  });

  it('an empty update only reads', async () => {
    const write = vi.spyOn(SubscriptionModel, 'findOneAndUpdate');
    const read = vi.spyOn(SubscriptionModel, 'findOne').mockReturnValue(leanQuery({ _id: ID }) as never);
    await repos.subscriptions.update(TENANT, ID, { set: {} });
    expect(write).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledWith({ _id: ID, tenantId: TENANT });
  });
});

describe('SubscriptionFilter translation', () => {
  it('ranges, unset fields, status lists and notDisabled', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'find').mockReturnValue(leanQuery([]) as never);
    await repos.subscriptions.findAcrossTenants({
      status: ['active', 'trial'],
      autoRenew: true,
      paymentOverdue: false,
      notDisabled: true,
      nextBillingDate: { gte: now, lte: now },
      endDate: { lte: now },
      unset: ['deactivatedAt', 'lateFeeAppliedAt'],
    });
    expect((spy.mock.calls[0] as unknown[])[0]).toEqual({
      status: { $in: ['active', 'trial'] },
      autoRenew: true,
      paymentOverdue: false,
      isActive: { $ne: false },
      nextBillingDate: { $gte: now, $lte: now },
      endDate: { $exists: true, $lte: now },
      deactivatedAt: { $exists: false },
      lateFeeAppliedAt: { $exists: false },
    });
  });

  it('a tenantId and ids narrow the match', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'updateMany').mockResolvedValue({ modifiedCount: 2 } as never);
    expect(await repos.subscriptions.updateManyAcrossTenants({ tenantId: TENANT, ids: [ID] }, { status: 'inactive' })).toBe(2);
    expect(spy.mock.calls[0][0]).toEqual({ tenantId: TENANT, _id: { $in: [ID] } });
    expect(spy.mock.calls[0][1]).toEqual({ $set: { status: 'inactive' } });
  });
});

describe('usage counters', () => {
  // The Subscription model skips the status-cache flush only for usage.*-only updates
  it('setUsage writes only usage.* paths and skips undefined counters', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await repos.subscriptions.setUsage(TENANT, { currentProducts: 4, currentUsers: undefined });
    expect((spy.mock.calls[0] as unknown[])[1]).toEqual({ $set: { 'usage.currentProducts': 4 } });
  });

  it('setUsage with nothing to write does not touch the database', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'updateOne');
    await repos.subscriptions.setUsage(TENANT, {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('incrementTransactionsSince reports whether the counter was current', async () => {
    const spy = vi.spyOn(SubscriptionModel, 'updateOne').mockResolvedValue({ matchedCount: 0 } as never);
    expect(await repos.subscriptions.incrementTransactionsSince(TENANT, now)).toBe(false);
    expect(spy.mock.calls[0]).toEqual([
      { tenantId: TENANT, 'usage.lastResetDate': { $gte: now } },
      { $inc: { 'usage.currentTransactions': 1 } },
    ]);
  });
});

describe('subscription plans', () => {
  it('update sets given fields, unsets nulls and runs validators', async () => {
    const spy = vi.spyOn(SubscriptionPlanModel, 'findByIdAndUpdate').mockReturnValue(leanQuery({ _id: ID }) as never);
    await repos.subscriptionPlans.update(ID, { isActive: false, description: null });
    expect(spy.mock.calls[0]).toEqual([
      ID,
      { $set: { isActive: false }, $unset: { description: 1 } },
      { new: true, runValidators: true },
    ]);
  });

  it('list sorts by monthly price and activeOnly filters', async () => {
    const q = leanQuery([]);
    const spy = vi.spyOn(SubscriptionPlanModel, 'find').mockReturnValue(q as never);
    await repos.subscriptionPlans.list({ activeOnly: true });
    expect(spy).toHaveBeenCalledWith({ isActive: true });
    expect(q.sort).toHaveBeenCalledWith({ 'price.monthly': 1 });
  });
});
