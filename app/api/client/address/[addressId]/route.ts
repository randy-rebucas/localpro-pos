import { NextRequest, NextResponse } from 'next/server';
import { getRepos } from '@/lib/db';
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
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { addressId } = await params;
    const body = await request.json();

    // Find the address, scoped to its owner: another user's address is
    // reported as not found (no unscoped lookup).
    const { addresses } = getRepos();
    const address = await addresses.findOwned(currentUser.userId, addressId);
    if (!address) {
      return NextResponse.json(
        { success: false, error: t('validation.addressNotFound', 'Address not found') },
        { status: 404 }
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
      await addresses.clearDefault(address.tenantId, currentUser.userId, addressId);
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

    const updatedAddress = await addresses.update(currentUser.userId, addressId, updates);

    await createAuditLog(request, {
      tenantId: address.tenantId,
      userId: currentUser.userId,
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
    t = await getValidationTranslatorFromRequest(request);

    const currentUser = await requireAuth(request);
    const { addressId } = await params;

    // Scoped to the owner: another user's address is reported as not found
    const { addresses } = getRepos();
    const address = await addresses.findOwned(currentUser.userId, addressId, { activeOnly: true });
    if (!address) {
      return NextResponse.json(
        { success: false, error: t('validation.addressNotFound', 'Address not found') },
        { status: 404 }
      );
    }

    const wasDefault = address.isDefault;
    const tenantId = address.tenantId;

    const deleted = await addresses.softDelete(currentUser.userId, addressId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: t('validation.addressNotFound', 'Address not found') },
        { status: 404 }
      );
    }

    // If we deleted the default address, promote the most recent remaining one
    if (wasDefault) {
      const nextDefault = await addresses.findFirstActive(tenantId, currentUser.userId);

      if (nextDefault) {
        await addresses.update(currentUser.userId, nextDefault._id, { isDefault: true });
      }
    }

    await createAuditLog(request, {
      tenantId,
      userId: currentUser.userId,
      action: AuditActions.DELETE,
      entityType: 'address',
      entityId: addressId,
      changes: { softDeleted: true },
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
