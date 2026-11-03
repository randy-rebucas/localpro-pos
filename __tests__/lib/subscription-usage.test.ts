process.env.NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/models/Subscription', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/SubscriptionPlan', () => ({
  default: { find: vi.fn(), findOne: vi.fn() },
}));

vi.mock('@/models/Tenant', () => ({
  default: { findByIdAndUpdate: vi.fn() },
}));

import Subscription from '@/models/Subscription';
import { SubscriptionService } from '@/lib/subscription';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SubscriptionMock = Subscription as any;

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function findOneChain(doc: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(doc),
    }),
  };
}

describe('SubscriptionService.recordTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the counter with a single updateOne when this month is already seeded', async () => {
    SubscriptionMock.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const count = vi.fn().mockResolvedValue(42);

    await SubscriptionService.recordTransaction('t1', count);

    expect(SubscriptionMock.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = SubscriptionMock.updateOne.mock.calls[0];
    expect(filter.tenantId).toBe('t1');
    expect(filter['usage.lastResetDate'].$gte).toEqual(startOfMonth());
    expect(update).toEqual({ $inc: { 'usage.currentTransactions': 1 } });
    expect(count).not.toHaveBeenCalled();
  });

  it('re-seeds the counter from the count callback when no doc matched for this month', async () => {
    SubscriptionMock.updateOne
      .mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 1 });
    const count = vi.fn().mockResolvedValue(17);
    const before = Date.now();

    await SubscriptionService.recordTransaction('t1', count);

    expect(count).toHaveBeenCalledTimes(1);
    expect(SubscriptionMock.updateOne).toHaveBeenCalledTimes(2);
    const [filter, update] = SubscriptionMock.updateOne.mock.calls[1];
    expect(filter).toEqual({ tenantId: 't1' });
    expect(update.$set['usage.currentTransactions']).toBe(17);
    expect(update.$set['usage.lastResetDate']).toBeInstanceOf(Date);
    expect(update.$set['usage.lastResetDate'].getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('SubscriptionService.getMonthlyTransactionCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when lastResetDate is before the start of the current month', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { currentTransactions: 99, lastResetDate: lastMonth } })
    );

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();
  });

  it('returns null just before the month boundary', async () => {
    const justBefore = new Date(startOfMonth().getTime() - 1);
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { currentTransactions: 5, lastResetDate: justBefore } })
    );

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();
  });

  it('returns the count when lastResetDate is within the current month', async () => {
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { currentTransactions: 23, lastResetDate: new Date() } })
    );

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(23);
  });

  it('returns the count when lastResetDate is exactly the start of the month', async () => {
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { currentTransactions: 3, lastResetDate: startOfMonth() } })
    );

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(3);
  });

  it('returns 0 when seeded this month but currentTransactions is missing', async () => {
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { lastResetDate: new Date().toISOString() } })
    );

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(0);
  });

  it('returns null when there is no subscription or no lastResetDate', async () => {
    SubscriptionMock.findOne.mockReturnValue(findOneChain(null));
    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();

    SubscriptionMock.findOne.mockReturnValue(findOneChain({ usage: { currentTransactions: 4 } }));
    expect(await SubscriptionService.getMonthlyTransactionCount('t2')).toBeNull();
  });

  it('caches the usage lookup per tenant', async () => {
    SubscriptionMock.findOne.mockReturnValue(
      findOneChain({ usage: { currentTransactions: 8, lastResetDate: new Date() } })
    );

    await SubscriptionService.getMonthlyTransactionCount('t1');
    await SubscriptionService.getMonthlyTransactionCount('t1');

    expect(SubscriptionMock.findOne).toHaveBeenCalledTimes(1);
    expect(SubscriptionMock.findOne).toHaveBeenCalledWith({ tenantId: 't1' });
  });
});
