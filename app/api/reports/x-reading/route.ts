import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getDailySalesAggregate, startOfBusinessDay } from '@/lib/data/reports';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * BIR X-Reading: a repeatable shift/day sales summary that does NOT reset or
 * lock anything — safe to run any number of times during the business day.
 */
export async function GET(request: NextRequest) {
  try {
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
    const businessDate = searchParams.get('date') ? new Date(searchParams.get('date')!) : new Date();

    const [aggregate, tenant] = await Promise.all([
      getDailySalesAggregate(tenantId, businessDate),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { grandTotalSales: true, grandTotalTransactionCount: true },
      }),
    ]);

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.X_READING_VIEW,
      entityType: 'x_reading',
      metadata: { businessDate: startOfBusinessDay(businessDate).toISOString() },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...aggregate,
        currentGrandTotal: tenant ? Number(tenant.grandTotalSales ?? 0) : 0,
        currentGrandTotalTransactionCount: tenant?.grandTotalTransactionCount ?? 0,
      },
    });
  } catch (error: unknown) {
    logger.error('Error generating X-Reading:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate X-Reading';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
