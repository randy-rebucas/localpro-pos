import { NextRequest, NextResponse } from 'next/server';
import prisma, { dbTransaction } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { randomUUID } from 'crypto';

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
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: tenantId }, { id: tenantId }],
        isActive: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found or inactive') },
        { status: 404 }
      );
    }

    // Unsetting the previous default and creating the new (possibly default)
    // address run in one transaction — otherwise two concurrent "set as
    // default" requests can each clear the other's default and both end up
    // marked default.
    const address = await dbTransaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId: currentUser.userId, tenantId: tenant.id, isDefault: true },
          data: { isDefault: false },
        });
      }

      // If user has no addresses, make this the default
      const existingCount = await tx.address.count({
        where: { userId: currentUser.userId, tenantId: tenant.id },
      });

      return tx.address.create({
        data: {
          id: randomUUID(),
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
    });

    await createAuditLog(request, {
      tenantId: tenant.id,
      userId: currentUser.userId,
      action: AuditActions.CREATE,
      entityType: 'address',
      entityId: address.id,
      metadata: { userId: currentUser.userId },
    });

    return NextResponse.json({ success: true, data: address }, { status: 201 });
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
