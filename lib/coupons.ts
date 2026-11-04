import { getRepos, type Coupon, type DbTx } from '@/lib/db';

export class CouponError extends Error {}

/**
 * Validates a coupon code, optionally against a specific plan purchase. Does
 * NOT reserve a use — callers that go on to actually charge the customer
 * must increment usedCount atomically themselves (see incrementCouponUsage)
 * so a coupon can't be over-redeemed by concurrent checkouts.
 *
 * `planId` is optional so this can also back a preview (e.g. "Apply" on a
 * pricing page showing several plans at once, before one is picked) — when
 * omitted, plan-eligibility isn't checked and callers are expected to filter
 * eligible plans themselves using the returned coupon's appliesTo/planIds.
 */
export async function validateCoupon(code: string, planId?: string): Promise<Coupon> {
  const coupon = await getRepos().coupons.findByCode(code);
  if (!coupon) throw new CouponError('Coupon code not found');
  if (!coupon.isActive) throw new CouponError('This coupon is no longer active');

  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) throw new CouponError('This coupon is not yet valid');
  if (coupon.validUntil && coupon.validUntil < now) throw new CouponError('This coupon has expired');

  if (typeof coupon.maxUses === 'number' && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError('This coupon has reached its usage limit');
  }

  if (planId && coupon.appliesTo === 'specific_plans') {
    const applies = coupon.planIds.some((id) => id === planId);
    if (!applies) throw new CouponError('This coupon does not apply to the selected plan');
  }

  return coupon;
}

/** Applies a coupon's discount to a base amount, floored at 0. */
export function applyCouponDiscount(baseAmount: number, coupon: Pick<Coupon, 'discountType' | 'discountValue'>): number {
  const discount = coupon.discountType === 'percentage'
    ? baseAmount * (coupon.discountValue / 100)
    : coupon.discountValue;
  return Math.max(0, Math.round((baseAmount - discount) * 100) / 100);
}

/**
 * Atomically reserves one use of the coupon, inside the caller's
 * transaction. The maxUses precondition is enforced by the filter itself (not a
 * read-then-write), so two concurrent checkouts against the last remaining
 * use can't both succeed.
 */
export async function incrementCouponUsage(couponId: string, tx: DbTx): Promise<void> {
  const reserved = await getRepos().coupons.incrementUsage(couponId, tx);

  if (!reserved) {
    throw new CouponError('This coupon has reached its usage limit');
  }
}
