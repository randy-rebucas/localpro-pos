import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Coupon from '@/models/Coupon';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// GET /api/super-admin/coupons
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const query: Record<string, unknown> = {};
    if (active === 'true') query.isActive = true;
    if (active === 'false') query.isActive = false;

    const [coupons, total] = await Promise.all([
      Coupon.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Coupon.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: coupons,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}

// POST /api/super-admin/coupons
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { code, description, discountType, discountValue, appliesTo, planIds, maxUses, validFrom, validUntil } = body;

    if (!code || !discountType || discountValue === undefined) {
      return NextResponse.json({ success: false, error: 'code, discountType, and discountValue are required' }, { status: 400 });
    }

    const coupon = await Coupon.create({
      code: String(code).toUpperCase(),
      description,
      discountType,
      discountValue: Number(discountValue),
      appliesTo: appliesTo || 'all_plans',
      planIds: planIds || [],
      maxUses: maxUses ? Number(maxUses) : undefined,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : undefined,
      isActive: true,
      createdBy: adminUser.userId,
    });

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'coupon.create',
      targetType: 'Coupon',
      targetId: String(coupon._id),
      description: `Created coupon ${code}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true, data: coupon }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
