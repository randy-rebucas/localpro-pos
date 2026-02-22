import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Address from '@/models/Address';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

interface RouteParams {
  params: Promise<{ addressId: string }>;
}

/**
 * PUT /api/client/address/{{addressId}}
 * Authenticated endpoint to update an address.
 * Body: { label?, street?, city?, state?, zipCode?, country?, isDefault? }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { addressId } = await params;
    const body = await request.json();

    // Find the address and verify ownership
    const address = await Address.findById(addressId);
    if (!address) {
      return NextResponse.json(
        { success: false, error: t('validation.addressNotFound', 'Address not found') },
        { status: 404 }
      );
    }

    if (address.userId.toString() !== currentUser.userId) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You can only update your own addresses') },
        { status: 403 }
      );
    }

    const { label, street, city, state, zipCode, country, isDefault } = body;

    const updates: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (label !== undefined) updates.label = label;
    if (street !== undefined) updates.street = street;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (zipCode !== undefined) updates.zipCode = zipCode;
    if (country !== undefined) updates.country = country;

    // Handle default flag
    if (isDefault === true) {
      await Address.updateMany(
        { userId: currentUser.userId, tenantId: address.tenantId, isDefault: true, _id: { $ne: addressId } },
        { $set: { isDefault: false } }
      );
      updates.isDefault = true;
    } else if (isDefault === false) {
      updates.isDefault = false;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.noChanges', 'No fields to update') },
        { status: 400 }
      );
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      { $set: updates },
      { new: true }
    ).lean();

    await createAuditLog(request, {
      tenantId: address.tenantId.toString(),
      action: AuditActions.UPDATE,
      entityType: 'address',
      entityId: addressId,
      changes: updates,
    });

    return NextResponse.json({ success: true, data: updatedAddress });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update address' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/client/address/{{addressId}}
 * Authenticated endpoint to delete an address.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  let t: (key: string, fallback: string) => string;
  try {
    await connectDB();
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { addressId } = await params;

    const address = await Address.findById(addressId);
    if (!address) {
      return NextResponse.json(
        { success: false, error: t('validation.addressNotFound', 'Address not found') },
        { status: 404 }
      );
    }

    if (address.userId.toString() !== currentUser.userId) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'You can only delete your own addresses') },
        { status: 403 }
      );
    }

    const wasDefault = address.isDefault;
    const tenantId = address.tenantId;

    await Address.findByIdAndDelete(addressId);

    // If we deleted the default address, promote the most recent remaining one
    if (wasDefault) {
      const nextDefault = await Address.findOne({
        userId: currentUser.userId,
        tenantId,
      }).sort({ createdAt: -1 });

      if (nextDefault) {
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }

    await createAuditLog(request, {
      tenantId: tenantId.toString(),
      action: AuditActions.DELETE,
      entityType: 'address',
      entityId: addressId,
    });

    return NextResponse.json({ success: true, message: t('validation.addressDeleted', 'Address deleted successfully') });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete address' },
      { status: 500 }
    );
  }
}
