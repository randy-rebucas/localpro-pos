import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

class CouponError extends Error {}

// Preview-only: validates a coupon code and returns its discount shape so a
// pricing page can show a discounted total before checkout. Never reserves a
// use — that happens atomically in subscriptions/activate at actual payment
// capture time.
//
// NOTE: this endpoint validates coupon existence/validity only (not
// tenant-scoped data — Coupon is a global, non-tenant-scoped model used by
// the super-admin billing system).
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    // Coupon codes are typically short and guessable — throttle probing.
    const ip = getClientIp(request);
    const rl = checkRateLimit(`coupon-validate:${ip}`, 20, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { code } = body;
    if (!code) {
      return NextResponse.json({ success: false, error: 'code is required' }, { status: 400 });
    }

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

    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        appliesTo: coupon.appliesTo,
        planIds: coupon.plans.map((p) => p.planId),
      },
    });
  } catch (error: unknown) {
    if (error instanceof CouponError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Failed to validate coupon' }, { status: 500 });
  }
}
