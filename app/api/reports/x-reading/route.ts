import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDailySalesAggregate, getBusinessDayRange, parseBusinessDateInput } from '@/lib/bir-readings';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantTimezone } from '@/lib/timezone';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * BIR X-Reading: a repeatable shift/day sales summary that does NOT reset or
 * lock anything — safe to run any number of times during the business day.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const user = await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'reports.x_reading'))) {
      return NextResponse.json({ success: false, error: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    // 'YYYY-MM-DD' means that calendar day in the tenant's timezone (not the server's — Vercel is UTC).
    const businessDate = parseBusinessDateInput(searchParams.get('date'));
    if (businessDate === null) {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }
    const tz = getTenantTimezone(await getTenantSettingsById(tenantId));
    const { start: businessDayStart, ymd } = getBusinessDayRange(businessDate, tz);

    const [aggregate, tenant] = await Promise.all([
      getDailySalesAggregate(tenantId, ymd, tz),
      Tenant.findById(tenantId).select('grandTotalSales grandTotalTransactionCount').lean(),
    ]);

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.X_READING_VIEW,
      entityType: 'x_reading',
      metadata: { businessDate: businessDayStart.toISOString(), businessDay: ymd, timezone: tz },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...aggregate,
        businessDay: ymd,
        timezone: tz,
        currentGrandTotal: tenant?.grandTotalSales ?? 0,
        currentGrandTotalTransactionCount: tenant?.grandTotalTransactionCount ?? 0,
      },
    });
  } catch (error: unknown) {
    logger.error('Error generating X-Reading:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate X-Reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
