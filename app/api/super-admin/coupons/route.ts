import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

function couponToApi(coupon: { id: string; discountValue: unknown; [key: string]: unknown }) {
  const { id, discountValue, ...rest } = coupon;
  return { _id: id, ...rest, discountValue: Number(discountValue) };
}

// GET /api/super-admin/coupons
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['super_admin']);

    const { searchParams } = new URL(request.url);
    const active = searchParams.get('active');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const where: Record<string, unknown> = {};
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.coupon.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: coupons.map(couponToApi),
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
    const adminUser = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { code, description, discountType, discountValue, appliesTo, planIds, maxUses, validFrom, validUntil } = body;

    if (!code || !discountType || discountValue === undefined) {
      return NextResponse.json({ success: false, error: 'code, discountType, and discountValue are required' }, { status: 400 });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: String(code).toUpperCase(),
        description,
        discountType,
        discountValue: Number(discountValue),
        appliesTo: appliesTo || 'all_plans',
        planIds: planIds || [],
        maxUses: maxUses ? Number(maxUses) : null,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: true,
        createdBy: adminUser.userId,
      },
    });

    const ip = request.headers.get('x-forwarded-for') || '';
    await prisma.superAdminAction.create({
      data: {
        adminUserId: adminUser.userId,
        action: 'coupon.create',
        targetType: 'Coupon',
        targetId: coupon.id,
        description: `Created coupon ${code}`,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({ success: true, data: couponToApi(coupon) }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
