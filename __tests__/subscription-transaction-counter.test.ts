import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/models/Subscription', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('@/models/SubscriptionPlan', () => ({
  default: { findOne: vi.fn() },
}));

vi.mock('@/models/Tenant', () => ({
  default: { findByIdAndUpdate: vi.fn() },
}));

vi.mock('@/models/Transaction', () => ({
  default: { countDocuments: vi.fn() },
}));

import Subscription from '@/models/Subscription';
import Transaction from '@/models/Transaction';
import { SubscriptionService } from '@/lib/subscription';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SubscriptionMock = Subscription as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TransactionMock = Transaction as any;

function mockSubscriptionUsage(usage: Record<string, unknown> | null) {
  SubscriptionMock.findOne.mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(usage ? { usage } : null),
    }),
  });
}

describe('SubscriptionService monthly transaction counter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // Oct 2026, local time
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the counter without counting when it is for the current month', async () => {
    mockSubscriptionUsage({ currentTransactions: 42, transactionsPeriod: '2026-10' });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(42);
    expect(TransactionMock.countDocuments).not.toHaveBeenCalled();
    expect(SubscriptionMock.updateOne).not.toHaveBeenCalled();
  });

  it('re-seeds the counter from a real count when the period is stale', async () => {
    mockSubscriptionUsage({ currentTransactions: 900, transactionsPeriod: '2026-09' });
    TransactionMock.countDocuments.mockResolvedValue(7);
    SubscriptionMock.updateOne.mockResolvedValue({ matchedCount: 1 });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(7);
    expect(TransactionMock.countDocuments).toHaveBeenCalledWith({
      tenantId: 't1',
      createdAt: { $gte: new Date(2026, 9, 1), $lt: new Date(2026, 10, 1) },
    });
    expect(SubscriptionMock.updateOne).toHaveBeenCalledWith(
      { tenantId: 't1' },
      { $set: { 'usage.currentTransactions': 7, 'usage.transactionsPeriod': '2026-10' } }
    );
  });

  it('recordTransaction increments with a single write in the current period', async () => {
    SubscriptionMock.updateOne.mockResolvedValue({ matchedCount: 1 });

    await SubscriptionService.recordTransaction('t1');

    expect(SubscriptionMock.updateOne).toHaveBeenCalledTimes(1);
    expect(SubscriptionMock.updateOne).toHaveBeenCalledWith(
      { tenantId: 't1', 'usage.transactionsPeriod': '2026-10' },
      { $inc: { 'usage.currentTransactions': 1 } }
    );
    expect(TransactionMock.countDocuments).not.toHaveBeenCalled();
  });

  it('recordTransaction re-seeds when the counter is from another month', async () => {
    SubscriptionMock.updateOne
      .mockResolvedValueOnce({ matchedCount: 0 })
      .mockResolvedValueOnce({ matchedCount: 1 });
    mockSubscriptionUsage({ currentTransactions: 3, transactionsPeriod: '2026-09' });
    TransactionMock.countDocuments.mockResolvedValue(1);

    await SubscriptionService.recordTransaction('t1');

    expect(TransactionMock.countDocuments).toHaveBeenCalledTimes(1);
    expect(SubscriptionMock.updateOne).toHaveBeenLastCalledWith(
      { tenantId: 't1' },
      { $set: { 'usage.currentTransactions': 1, 'usage.transactionsPeriod': '2026-10' } }
    );
  });

  it('assertTransactionLimit skips counting on unlimited plans', async () => {
    const spy = vi.spyOn(SubscriptionService, 'getSubscriptionStatus').mockResolvedValue({
      isActive: true,
      isTrial: false,
      isExpired: false,
      isTrialExpired: false,
      limits: { maxTransactions: -1 },
    } as never);

    await expect(SubscriptionService.assertTransactionLimit('t1')).resolves.toBeUndefined();
    expect(SubscriptionMock.findOne).not.toHaveBeenCalled();
    expect(TransactionMock.countDocuments).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('assertTransactionLimit rejects when the monthly limit is reached', async () => {
    const spy = vi.spyOn(SubscriptionService, 'getSubscriptionStatus').mockResolvedValue({
      isActive: true,
      isTrial: false,
      isExpired: false,
      isTrialExpired: false,
      limits: { maxTransactions: 500 },
    } as never);
    mockSubscriptionUsage({ currentTransactions: 500, transactionsPeriod: '2026-10' });

    await expect(SubscriptionService.assertTransactionLimit('t1')).rejects.toThrow(/limit exceeded/);
    spy.mockRestore();
  });
});
