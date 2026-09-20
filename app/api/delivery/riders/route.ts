import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - List tenant users with role `rider` (for assignment dropdowns).
 */
export async function GET(request: NextRequest) {
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

    if (
      !(await hasTenantPermission(user.role, tenantId, 'delivery.view')) &&
      !(await hasTenantPermission(user.role, tenantId, 'delivery.manage'))
    ) {
      return NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('isActive');
    const where: Record<string, unknown> = { tenantId, role: 'rider' };
    if (isActiveParam === 'true') where.isActive = true;
    else if (isActiveParam === 'false') where.isActive = false;

    const riders = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        riderVehicleType: true,
        riderLicenseNumber: true,
        riderCurrentLatitude: true,
        riderCurrentLongitude: true,
        riderLocationUpdatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: riders });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get riders error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToFetchRiders', 'Failed to fetch riders') },
      { status: 500 }
    );
  }
}
