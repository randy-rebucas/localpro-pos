import { beforeEach, describe, expect, it, vi } from 'vitest';

const repos = vi.hoisted(() => ({ payments: { list: vi.fn() } }));
vi.mock('@/lib/db', () => ({ getRepos: () => repos }));

import {
  calculateOnAccountRefundAmount,
  getOnAccountTotalForTransaction,
  wouldExceedCreditLimit,
  parseCreditLimitInput,
} from '@/lib/customer-credit';

describe('wouldExceedCreditLimit', () => {
  it('returns false when no credit limit is set', () => {
    expect(wouldExceedCreditLimit(50, 100, undefined)).toBe(false);
    expect(wouldExceedCreditLimit(50, 100, null)).toBe(false);
  });

  it('returns true when projected balance exceeds limit', () => {
    expect(wouldExceedCreditLimit(80, 30, 100)).toBe(true);
  });

  it('returns false when projected balance is within limit', () => {
    expect(wouldExceedCreditLimit(80, 20, 100)).toBe(false);
  });
});

describe('calculateOnAccountRefundAmount', () => {
  it('returns proportional on-account refund for split payments', () => {
    expect(calculateOnAccountRefundAmount(50, 100, 40)).toBe(20);
  });

  it('returns full on-account amount for full refunds', () => {
    expect(calculateOnAccountRefundAmount(100, 100, 40)).toBe(40);
  });

  it('returns zero when there is no on-account portion', () => {
    expect(calculateOnAccountRefundAmount(50, 100, 0)).toBe(0);
  });
});

describe('parseCreditLimitInput', () => {
  it('parses numeric strings and clears empty values', () => {
    expect(parseCreditLimitInput('250')).toBe(250);
    expect(parseCreditLimitInput('')).toBe(null);
    expect(parseCreditLimitInput(null)).toBe(null);
    expect(parseCreditLimitInput(undefined)).toBe(undefined);
  });

  it('returns NaN for invalid values', () => {
    expect(Number.isNaN(parseCreditLimitInput('abc') as number)).toBe(true);
    expect(Number.isNaN(parseCreditLimitInput(-5) as number)).toBe(true);
  });
});

describe('getOnAccountTotalForTransaction', () => {
  beforeEach(() => {
    repos.payments.list.mockReset();
  });

  it('sums the completed on-account payments of the transaction', async () => {
    repos.payments.list.mockResolvedValue([{ amount: 30 }, { amount: 20.5 }]);

    await expect(getOnAccountTotalForTransaction('t1', 'tx1', 100, 'cash')).resolves.toBe(50.5);
    expect(repos.payments.list).toHaveBeenCalledWith(
      't1',
      { transactionId: 'tx1', method: 'on_account', status: 'completed' },
      { select: 'amount' }
    );
  });

  it('falls back to the transaction total for an on-account sale without payment rows', async () => {
    repos.payments.list.mockResolvedValue([]);

    await expect(getOnAccountTotalForTransaction('t1', 'tx1', 100, 'on_account')).resolves.toBe(100);
    await expect(getOnAccountTotalForTransaction('t1', 'tx1', 100, 'cash')).resolves.toBe(0);
  });
});
