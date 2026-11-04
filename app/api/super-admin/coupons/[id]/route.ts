import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleApiError } from '@/lib/error-handler';

// PUT /api/super-admin/coupons/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const body = await request.json();

    // A falsy maxUses/validUntil means "no change" (undefined), as with the
    // previous findByIdAndUpdate, which dropped undefined keys.
    const coupon = await getRepos().coupons.update(id, {
      description: body.description,
      discountType: body.discountType,
      discountValue: body.discountValue !== undefined ? Number(body.discountValue) : undefined,
      appliesTo: body.appliesTo,
      planIds: body.planIds,
      maxUses: body.maxUses ? Number(body.maxUses) : undefined,
      validFrom: body.validFrom !== undefined ? new Date(body.validFrom) : undefined,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      isActive: body.isActive,
    });

    if (!coupon) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await getRepos().superAdminActions.create({
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
    const adminUser = await requireRole(request, ['super_admin']);

    const { id } = await params;
    const coupon = await getRepos().coupons.delete(id);
    if (!coupon) {
      return NextResponse.json({ success: false, error: 'Coupon not found' }, { status: 404 });
    }

    const ip = request.headers.get('x-forwarded-for') || '';
    await getRepos().superAdminActions.create({
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
