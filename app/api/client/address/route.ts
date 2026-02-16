import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Address from '@/models/Address';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

/**
 * POST /api/client/address
 * Authenticated endpoint to add a new address for the current user.
 * Body: { tenantId, label?, street, city, state?, zipCode?, country, isDefault? }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const body = await request.json();
    const { tenantId, label, street, city, state, zipCode, country, isDefault } = body;

    if (!tenantId || !street || !city || !country) {
      return NextResponse.json(
        { success: false, error: t('validation.addressFieldsRequired', 'tenantId, street, city, and country are required') },
        { status: 400 }
      );
    }

    // Resolve tenant
    const Tenant = (await import('@/models/Tenant')).default;
    const tenant = await Tenant.findOne({
      $or: [{ slug: tenantId }, ...(tenantId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: tenantId }] : [])],
      isActive: true,
    }).lean();

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // If this is the default address, unset previous default
    if (isDefault) {
      await Address.updateMany(
        { userId: currentUser.userId, tenantId: tenant._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    // If user has no addresses, make this the default
    const existingCount = await Address.countDocuments({ userId: currentUser.userId, tenantId: tenant._id });

    const address = await Address.create({
      userId: currentUser.userId,
      tenantId: tenant._id,
      label: label || 'Home',
      street,
      city,
      state,
      zipCode,
      country,
      isDefault: isDefault || existingCount === 0,
    });

    await createAuditLog(request, {
      tenantId: tenant._id.toString(),
      action: AuditActions.CREATE,
      entityType: 'address',
      entityId: address._id.toString(),
      metadata: { userId: currentUser.userId },
    });

    return NextResponse.json({ success: true, data: address }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create address' },
      { status: 500 }
    );
  }
}
