import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getSalesReport } from '@/lib/analytics';
import Tenant from '@/models/Tenant';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
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
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const tenantDoc = await Tenant.findById(tenantId).select('settings.timezone').lean();
    const tenantTz = tenantDoc?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') || 'daily') as 'daily' | 'weekly' | 'monthly';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const startDate = startDateParam ? getTenantDayBoundaries(startDateParam, tenantTz).start : undefined;
    const endDate = endDateParam ? getTenantDayBoundaries(endDateParam, tenantTz).end : undefined;

    const report = await getSalesReport(tenantId, period, startDate, endDate);

    return NextResponse.json({ success: true, data: report });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching sales report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

