import { describe, expect, it } from 'vitest';
import {
  calculateOnAccountRefundAmount,
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
