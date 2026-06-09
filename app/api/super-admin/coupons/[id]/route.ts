import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Coupon from '@/models/Coupon';
import SuperAdminAction from '@/models/SuperAdminAction';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// PUT /api/super-admin/coupons/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.discountType !== undefined && { discountType: body.discountType }),
        ...(body.discountValue !== undefined && { discountValue: Number(body.discountValue) }),
        ...(body.appliesTo !== undefined && { appliesTo: body.appliesTo }),
        ...(body.planIds !== undefined && { planIds: body.planIds }),
        ...(body.maxUses !== undefined && { maxUses: body.maxUses ? Number(body.maxUses) : undefined }),
        ...(body.validFrom !== undefined && { validFrom: new Date(body.validFrom) }),
        ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : undefined }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      { new: true }
    );

    if (!coupon) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'coupon.update',
      targetType: 'Coupon',
      targetId: id,
      description: `Updated coupon ${coupon.code}`,
      changes: body,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true, data: coupon });
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
    await connectDB();
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await SuperAdminAction.create({
      adminUserId: adminUser.userId,
      action: 'coupon.delete',
      targetType: 'Coupon',
      targetId: id,
      description: `Deleted coupon ${coupon.code}`,
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') || '',
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message.includes('Forbidden'))) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.message === 'Unauthorized' ? 401 : 403 });
    }
    return handleApiError(error);
  }
}
