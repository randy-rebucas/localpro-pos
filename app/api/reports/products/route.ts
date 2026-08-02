import { NextRequest, NextResponse } from 'next/server';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getProductPerformance } from '@/lib/analytics';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.view'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    // Check if reports feature is enabled in subscription
    try {
      await checkFeatureAccess(tenantId.toString(), 'enableReports');
    } catch (featureError: unknown) {
      return NextResponse.json(
        { success: false, error: (featureError as Error).message },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate')
      ? new Date(searchParams.get('startDate')!)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = searchParams.get('endDate')
      ? new Date(searchParams.get('endDate')!)
      : new Date();
    startDate.setHours(0, 0, 0, 0);
    if (searchParams.get('endDate')) endDate.setHours(23, 59, 59, 999);
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const performance = await getProductPerformance(tenantId, startDate, endDate, limit);

    return NextResponse.json({ success: true, data: performance });
  } catch (error: unknown) {
    logger.error('Error fetching product performance:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch product performance';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
