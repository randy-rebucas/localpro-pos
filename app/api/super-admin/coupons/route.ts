import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

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
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { plans: true },
      }),
      prisma.coupon.count({ where }),
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
    const adminUser = await requireRole(request, ['super_admin']);

    const body = await request.json();
    const { code, description, discountType, discountValue, appliesTo, planIds, maxUses, validFrom, validUntil } = body;

    if (!code || !discountType || discountValue === undefined) {
      return NextResponse.json({ success: false, error: 'code, discountType, and discountValue are required' }, { status: 400 });
    }
    const numericDiscount = Number(discountValue);
    if (!Number.isFinite(numericDiscount) || numericDiscount <= 0) {
      return NextResponse.json({ success: false, error: 'discountValue must be a positive number' }, { status: 400 });
    }
    if (discountType === 'percentage' && numericDiscount > 100) {
      return NextResponse.json({ success: false, error: 'Percentage discountValue cannot exceed 100' }, { status: 400 });
    }

    const couponId = randomUUID();
    const coupon = await prisma.coupon.create({
      data: {
        id: couponId,
        code: String(code).toUpperCase(),
        description,
        discountType,
        discountValue: Number(discountValue),
        appliesTo: appliesTo || 'all_plans',
        maxUses: maxUses ? Number(maxUses) : undefined,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : undefined,
        isActive: true,
        createdById: adminUser.userId,
        plans: planIds && planIds.length > 0
          ? { create: (planIds as string[]).map((planId) => ({ planId })) }
          : undefined,
      },
      include: { plans: true },
    });

    const ip = request.headers.get('x-forwarded-for') || '';
    await prisma.superAdminAction.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.userId,
        action: 'coupon.create',
        targetType: 'Coupon',
        targetId: coupon.id,
        description: `Created coupon ${code}`,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({ success: true, data: coupon }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
