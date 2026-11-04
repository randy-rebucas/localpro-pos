(process.env as Record<string, string>).NODE_ENV = 'test';

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const repos = vi.hoisted(() => ({
  subscriptions: {
    findUsage: vi.fn(),
    incrementTransactionsSince: vi.fn(),
    setUsage: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
}));

import { SubscriptionService } from '@/lib/subscription';

const subs = repos.subscriptions;

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

describe('SubscriptionService.recordTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments the counter with a single write when this month is already seeded', async () => {
    subs.incrementTransactionsSince.mockResolvedValue(true);
    const count = vi.fn().mockResolvedValue(42);

    await SubscriptionService.recordTransaction('t1', count);

    expect(subs.incrementTransactionsSince).toHaveBeenCalledTimes(1);
    expect(subs.incrementTransactionsSince).toHaveBeenCalledWith('t1', startOfMonth());
    expect(subs.setUsage).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('re-seeds the counter from the count callback when no doc matched for this month', async () => {
    subs.incrementTransactionsSince.mockResolvedValue(false);
    subs.setUsage.mockResolvedValue(undefined);
    const count = vi.fn().mockResolvedValue(17);
    const before = Date.now();

    await SubscriptionService.recordTransaction('t1', count);

    expect(count).toHaveBeenCalledTimes(1);
    expect(subs.setUsage).toHaveBeenCalledTimes(1);
    const [tenantId, usage] = subs.setUsage.mock.calls[0];
    expect(tenantId).toBe('t1');
    expect(usage.currentTransactions).toBe(17);
    expect(usage.lastResetDate).toBeInstanceOf(Date);
    expect(usage.lastResetDate.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('SubscriptionService.getMonthlyTransactionCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when lastResetDate is before the start of the current month', async () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    subs.findUsage.mockResolvedValue({ currentTransactions: 99, lastResetDate: lastMonth });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();
  });

  it('returns null just before the month boundary', async () => {
    const justBefore = new Date(startOfMonth().getTime() - 1);
    subs.findUsage.mockResolvedValue({ currentTransactions: 5, lastResetDate: justBefore });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();
  });

  it('returns the count when lastResetDate is within the current month', async () => {
    subs.findUsage.mockResolvedValue({ currentTransactions: 23, lastResetDate: new Date() });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(23);
  });

  it('returns the count when lastResetDate is exactly the start of the month', async () => {
    subs.findUsage.mockResolvedValue({ currentTransactions: 3, lastResetDate: startOfMonth() });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(3);
  });

  it('returns 0 when seeded this month but currentTransactions is missing', async () => {
    subs.findUsage.mockResolvedValue({ lastResetDate: new Date().toISOString() });

    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBe(0);
  });

  it('returns null when there is no subscription or no lastResetDate', async () => {
    subs.findUsage.mockResolvedValue(null);
    expect(await SubscriptionService.getMonthlyTransactionCount('t1')).toBeNull();

    subs.findUsage.mockResolvedValue({ currentTransactions: 4 });
    expect(await SubscriptionService.getMonthlyTransactionCount('t2')).toBeNull();
  });

  it('caches the usage lookup per tenant', async () => {
    subs.findUsage.mockResolvedValue({ currentTransactions: 8, lastResetDate: new Date() });

    await SubscriptionService.getMonthlyTransactionCount('t1');
    await SubscriptionService.getMonthlyTransactionCount('t1');

    expect(subs.findUsage).toHaveBeenCalledTimes(1);
    expect(subs.findUsage).toHaveBeenCalledWith('t1');
  });
});
