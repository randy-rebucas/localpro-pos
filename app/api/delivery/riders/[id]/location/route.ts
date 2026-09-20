import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * PATCH - Update a rider's current lat/lng (polling endpoint for live map
 * tracking). Rate-limited more aggressively than other delivery writes since
 * a rider's device may call this every few seconds.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    const t = await getValidationTranslatorFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: t('validation.unauthorized', 'Unauthorized') },
        { status: 401 }
      );
    }

    const tenantId = await getTenantIdFromRequest(request);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: t('validation.tenantNotFound', 'Tenant not found') },
        { status: 404 }
      );
    }

    const { id } = await params;

    // A rider may update their own live location; anyone else needs delivery.manage.
    const isSelf = user.userId === id;
    if (!isSelf && !(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:rider-location:${tenantId}:${id}:${ip}`, 12, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const rider = await prisma.user.findFirst({ where: { id, tenantId, role: 'rider' } });
    if (!rider) {
      return NextResponse.json(
        { success: false, error: t('validation.riderNotFound', 'Rider not found') },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { latitude, longitude } = body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { success: false, error: t('validation.locationRequired', 'latitude and longitude are required numbers') },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        riderCurrentLatitude: latitude,
        riderCurrentLongitude: longitude,
        riderLocationUpdatedAt: new Date(),
      },
      select: {
        id: true,
        riderCurrentLatitude: true,
        riderCurrentLongitude: true,
        riderLocationUpdatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Update rider location error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToUpdateLocation', 'Failed to update rider location') },
      { status: 500 }
    );
  }
}
