import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import { validateCoupon, CouponError } from '@/lib/coupons';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Preview-only: validates a coupon code and returns its discount shape so a
// pricing page can show a discounted total before checkout. Never reserves a
// use — that happens atomically in subscriptions/activate at actual payment
// capture time.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
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

    const coupon = await validateCoupon(code);

    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        appliesTo: coupon.appliesTo,
        planIds: coupon.planIds.map((id) => id.toString()),
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
