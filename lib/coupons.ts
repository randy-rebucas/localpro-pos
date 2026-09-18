import prisma from '@/lib/db';
import { Prisma, type Coupon, type CouponPlan } from '@prisma/client';

export class CouponError extends Error {}

/**
 * `validateCoupon`'s resolved shape. `_id` is a compatibility alias for
 * `id` (kept so existing callers written against the pre-migration Mongoose
 * `ICoupon._id` shape — e.g. app/api/subscriptions/activate/route.ts's
 * `incrementCouponUsage(coupon._id, ...)` call — keep working unchanged).
 */
export type ResolvedCoupon = Coupon & { plans: CouponPlan[]; _id: string };

/**
 * Validates a coupon code, optionally against a specific plan purchase. Does
 * NOT reserve a use — callers that go on to actually charge the customer
 * must increment usedCount atomically themselves (see incrementCouponUsage)
 * so a coupon can't be over-redeemed by concurrent checkouts.
 *
 * `planId` is optional so this can also back a preview (e.g. "Apply" on a
 * pricing page showing several plans at once, before one is picked) — when
 * omitted, plan-eligibility isn't checked and callers are expected to filter
 * eligible plans themselves using the returned coupon's appliesTo/plans.
 */
export async function validateCoupon(code: string, planId?: string): Promise<ResolvedCoupon> {
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.toUpperCase() },
    include: { plans: true },
  });
  if (!coupon) throw new CouponError('Coupon code not found');
  if (!coupon.isActive) throw new CouponError('This coupon is no longer active');

  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) throw new CouponError('This coupon is not yet valid');
  if (coupon.validUntil && coupon.validUntil < now) throw new CouponError('This coupon has expired');

  if (typeof coupon.maxUses === 'number' && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError('This coupon has reached its usage limit');
  }

  if (planId && coupon.appliesTo === 'specific_plans') {
    const applies = coupon.plans.some((p) => p.planId === planId);
    if (!applies) throw new CouponError('This coupon does not apply to the selected plan');
  }

  return { ...coupon, _id: coupon.id };
}

/** Applies a coupon's discount to a base amount, floored at 0. */
export function applyCouponDiscount(
  baseAmount: number,
  coupon: Pick<Coupon, 'discountType' | 'discountValue'>
): number {
  const discountValue = Number(coupon.discountValue);
  const discount = coupon.discountType === 'percentage'
    ? baseAmount * (discountValue / 100)
    : discountValue;
  return Math.max(0, Math.round((baseAmount - discount) * 100) / 100);
}

/**
 * Atomically reserves one use of the coupon. The maxUses precondition is
 * enforced by the update's WHERE clause itself (evaluated atomically by
 * Postgres at update time, not a read-then-write), so two concurrent
 * checkouts against the last remaining use can't both succeed.
 *
 * `client` accepts an in-flight `prisma.$transaction` callback client so
 * this can participate in a caller's transaction; it defaults to the global
 * Prisma client when omitted (matching the old Mongoose "session optional"
 * behavior).
 */
export async function incrementCouponUsage(
  couponId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const coupon = await client.coupon.findUnique({
    where: { id: couponId },
    select: { maxUses: true },
  });
  if (!coupon) {
    throw new CouponError('This coupon has reached its usage limit');
  }

  const result = await client.coupon.updateMany({
    where: {
      id: couponId,
      ...(coupon.maxUses == null ? {} : { usedCount: { lt: coupon.maxUses } }),
    },
    data: { usedCount: { increment: 1 } },
  });
  if (result.count === 0) {
    throw new CouponError('This coupon has reached its usage limit');
  }
}
