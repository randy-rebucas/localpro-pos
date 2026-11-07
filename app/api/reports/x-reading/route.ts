import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getTenantIdFromRequest, handleTenantAccessViolation, TenantAccessViolationError } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDailySalesAggregate, startOfBusinessDay } from '@/lib/bir-readings';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { handleApiError } from '@/lib/error-handler';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { checkRateLimit } from '@/lib/rate-limit';

/** Only a real calendar day, so '2026-02-31' can't roll over into March. */
function parseBusinessDate(value: string | null): Date | string | null {
  if (!value) return new Date();
  const date = new Date(`${value}T00:00:00.000Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

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

    // Per user, since each view also writes an audit entry and cashiers can run it
    const rl = checkRateLimit(`x-reading:${tenantId}:${user.userId}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: t('validation.tooManyRequests', 'Too many requests') }, { status: 429 });
    }

    const businessDate = parseBusinessDate(request.nextUrl.searchParams.get('date'));
    if (!businessDate) {
      return NextResponse.json({ success: false, error: t('validation.invalidDate', 'Invalid date') }, { status: 400 });
    }

    const tenant = await Tenant.findById(tenantId).select('grandTotalSales grandTotalTransactionCount settings.timezone').lean();
    const timezone = tenant?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
    const aggregate = await getDailySalesAggregate(tenantId, businessDate, timezone);

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.X_READING_VIEW,
      entityType: 'x_reading',
      metadata: { businessDate: startOfBusinessDay(businessDate, timezone).toISOString() },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...aggregate,
        currentGrandTotal: tenant?.grandTotalSales ?? 0,
        currentGrandTotalTransactionCount: tenant?.grandTotalTransactionCount ?? 0,
      },
    });
  } catch (error: unknown) {
    if (error instanceof TenantAccessViolationError) {
      return handleTenantAccessViolation(error, request);
    }
    return handleApiError(error, 'Failed to generate X-Reading');
  }
}
