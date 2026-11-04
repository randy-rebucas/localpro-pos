import { describe, it, expect, vi, beforeEach } from 'vitest';

const repos = {
  coupons: {
    findByCode: vi.fn(),
    incrementUsage: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  getRepos: () => repos,
  mongoTx: (s: unknown) => ({ driver: 'mongo', session: s }),
  isDuplicateKeyError: (e: { code?: number } | null) => e?.code === 11000,
}));

import { validateCoupon, incrementCouponUsage, applyCouponDiscount, CouponError } from '@/lib/coupons';

const DAY = 24 * 60 * 60 * 1000;

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    _id: '64b000000000000000000001',
    code: 'SAVE10',
    discountType: 'percentage',
    discountValue: 10,
    appliesTo: 'all_plans',
    planIds: [],
    usedCount: 0,
    validFrom: new Date(Date.now() - DAY),
    isActive: true,
    createdBy: '64b000000000000000000002',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('validateCoupon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks the code up through the coupon repository', async () => {
    repos.coupons.findByCode.mockResolvedValue(coupon());
    await validateCoupon('save10');
    expect(repos.coupons.findByCode).toHaveBeenCalledWith('save10');
  });

  it('rejects an unknown code', async () => {
    repos.coupons.findByCode.mockResolvedValue(null);
    await expect(validateCoupon('NOPE')).rejects.toThrow(new CouponError('Coupon code not found'));
  });

  it('rejects an inactive coupon', async () => {
    repos.coupons.findByCode.mockResolvedValue(coupon({ isActive: false }));
    await expect(validateCoupon('SAVE10')).rejects.toThrow('This coupon is no longer active');
  });

  it('rejects a coupon that is not yet valid', async () => {
    repos.coupons.findByCode.mockResolvedValue(coupon({ validFrom: new Date(Date.now() + DAY) }));
    await expect(validateCoupon('SAVE10')).rejects.toThrow('This coupon is not yet valid');
  });

  it('rejects an expired coupon', async () => {
    repos.coupons.findByCode.mockResolvedValue(coupon({ validUntil: new Date(Date.now() - 1000) }));
    await expect(validateCoupon('SAVE10')).rejects.toThrow('This coupon has expired');
  });

  it('rejects a coupon that reached maxUses', async () => {
    repos.coupons.findByCode.mockResolvedValue(coupon({ maxUses: 5, usedCount: 5 }));
    await expect(validateCoupon('SAVE10')).rejects.toThrow('This coupon has reached its usage limit');
  });

  it('rejects a plan the coupon does not apply to', async () => {
    repos.coupons.findByCode.mockResolvedValue(
      coupon({ appliesTo: 'specific_plans', planIds: ['64b0000000000000000000aa'] })
    );
    await expect(validateCoupon('SAVE10', '64b0000000000000000000bb')).rejects.toThrow(
      'This coupon does not apply to the selected plan'
    );
  });

  it('skips the plan check when no planId is given', async () => {
    const c = coupon({ appliesTo: 'specific_plans', planIds: ['64b0000000000000000000aa'] });
    repos.coupons.findByCode.mockResolvedValue(c);
    await expect(validateCoupon('SAVE10')).resolves.toBe(c);
  });

  it('returns a valid coupon for an eligible plan', async () => {
    const c = coupon({
      appliesTo: 'specific_plans',
      planIds: ['64b0000000000000000000aa'],
      maxUses: 5,
      usedCount: 4,
      validUntil: new Date(Date.now() + DAY),
    });
    repos.coupons.findByCode.mockResolvedValue(c);
    await expect(validateCoupon('SAVE10', '64b0000000000000000000aa')).resolves.toBe(c);
  });

  it('thrown errors are CouponError instances', async () => {
    repos.coupons.findByCode.mockResolvedValue(null);
    await expect(validateCoupon('NOPE')).rejects.toBeInstanceOf(CouponError);
  });
});

describe('incrementCouponUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the transaction through', async () => {
    repos.coupons.incrementUsage.mockResolvedValue(true);
    const tx = { driver: 'mongo', session: { id: 'session-1' } } as never;
    await expect(incrementCouponUsage('64b000000000000000000001', tx)).resolves.toBeUndefined();
    expect(repos.coupons.incrementUsage).toHaveBeenCalledWith('64b000000000000000000001', tx);
  });


  it('throws CouponError when no use could be reserved', async () => {
    repos.coupons.incrementUsage.mockResolvedValue(false);
    const err = await incrementCouponUsage('64b000000000000000000001', {} as never).catch((e) => e);
    expect(err).toBeInstanceOf(CouponError);
    expect(err.message).toBe('This coupon has reached its usage limit');
  });
});

describe('applyCouponDiscount', () => {
  it('applies percentage and fixed discounts, floored at 0', () => {
    expect(applyCouponDiscount(200, { discountType: 'percentage', discountValue: 10 })).toBe(180);
    expect(applyCouponDiscount(200, { discountType: 'fixed', discountValue: 50 })).toBe(150);
    expect(applyCouponDiscount(20, { discountType: 'fixed', discountValue: 50 })).toBe(0);
  });
});
