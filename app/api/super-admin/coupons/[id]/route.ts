import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

function couponToApi(coupon: { id: string; discountValue: unknown; [key: string]: unknown }) {
  const { id, discountValue, ...rest } = coupon;
  return { _id: id, ...rest, discountValue: Number(discountValue) };
}

// PUT /api/super-admin/coupons/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    let coupon;
    try {
      coupon = await prisma.coupon.update({
        where: { id },
        data: {
          ...(body.description !== undefined && { description: body.description }),
          ...(body.discountType !== undefined && { discountType: body.discountType }),
          ...(body.discountValue !== undefined && { discountValue: Number(body.discountValue) }),
          ...(body.appliesTo !== undefined && { appliesTo: body.appliesTo }),
          ...(body.planIds !== undefined && { planIds: body.planIds }),
          ...(body.maxUses !== undefined && { maxUses: body.maxUses ? Number(body.maxUses) : null }),
          ...(body.validFrom !== undefined && { validFrom: new Date(body.validFrom) }),
          ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
    } catch (updateError: unknown) {
      if ((updateError as Record<string, unknown>).code === 'P2025') {
        return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
      }
      throw updateError;
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await prisma.superAdminAction.create({
      data: {
        adminUserId: adminUser.userId,
        action: 'coupon.update',
        targetType: 'Coupon',
        targetId: id,
        description: `Updated coupon ${coupon.code}`,
        changes: body,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({ success: true, data: couponToApi(coupon) });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}

// DELETE /api/super-admin/coupons/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    let coupon;
    try {
      coupon = await prisma.coupon.delete({ where: { id } });
    } catch (deleteError: unknown) {
      if ((deleteError as Record<string, unknown>).code === 'P2025') {
        return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
      }
      throw deleteError;
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await prisma.superAdminAction.create({
      data: {
        adminUserId: adminUser.userId,
        action: 'coupon.delete',
        targetType: 'Coupon',
        targetId: id,
        description: `Deleted coupon ${coupon.code}`,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
