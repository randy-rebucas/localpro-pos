import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

function toApi(address: any) {
  const { id, ...rest } = address;
  return { _id: id, ...rest };
}

/**
 * POST /api/client/address
 * Authenticated endpoint to add a new address for the current user.
 * Body: { tenantId, label?, street, city, state?, zipCode?, country, isDefault? }
 */
export async function POST(request: NextRequest) {
  let t: (key: string, fallback: string) => string;
  try {
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: tenantId }, ...(isUuid ? [{ id: tenantId }] : [])],
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // If this is the default address, unset previous default
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: currentUser.userId, tenantId: tenant.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // If user has no addresses, make this the default
    const existingCount = await prisma.address.count({ where: { userId: currentUser.userId, tenantId: tenant.id } });

    const address = await prisma.address.create({
      data: {
        userId: currentUser.userId,
        tenantId: tenant.id,
        label: label || 'Home',
        street,
        city,
        state,
        zipCode,
        country,
        isDefault: isDefault || existingCount === 0,
      },
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: currentUser.userId,
      action: AuditActions.CREATE,
      entityType: 'address',
      entityId: address.id,
      metadata: { userId: currentUser.userId },
    });

    return NextResponse.json({ success: true, data: toApi(address) }, { status: 201 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create address' },
      { status: 500 }
    );
  }
}
