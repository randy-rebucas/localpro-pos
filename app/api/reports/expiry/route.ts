import { NextRequest, NextResponse } from 'next/server';
import { getRepos, type ProductFilter } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { handleApiError } from '@/lib/error-handler';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!(await hasTenantPermission(user.role, user.tenantId, 'expiry_tracking.manage'))) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Get tenant's configured alert days, fallback to query param or 90
    const tenant = await getRepos().tenants.findById(user.tenantId);
    const defaultAlertDays = tenant?.settings?.pharmacyCompliance?.expiryAlertDays ?? 90;
    const { searchParams } = new URL(request.url);
    const alertDays = Number(searchParams.get('days') ?? defaultAlertDays);
    const scheduleFilter = searchParams.get('schedule'); // otc | rx | dangerous

    const today = getTenantDayBoundaries(new Date(), tenant?.settings?.timezone || DEFAULT_TENANT_TIMEZONE).start;
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + alertDays);

    const baseFilter: ProductFilter = { active: 'flagged' };
    if (scheduleFilter) baseFilter.drugSchedule = scheduleFilter as NonNullable<ProductFilter['drugSchedule']>;

    // Fetch both already-expired and expiring-within-alertDays
    const { products } = getRepos();
    const listOpts = { select: 'name genericName sku batchNumber expiryDate stock drugSchedule', sort: 'expiryDate' as const };
    const [expired, expiring] = await Promise.all([
      products.list(user.tenantId, { ...baseFilter, expiryDate: { lt: today } }, listOpts),
      products.list(user.tenantId, { ...baseFilter, expiryDate: { gte: today, lte: alertDate } }, listOpts),
    ]);

    const now = Date.now();

    const mapProduct = <P extends { expiryDate?: Date }>(p: P) => {

      const expiryDate = p.expiryDate as Date;
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now) / 86400000);
      let status: 'expired' | 'critical' | 'warning';
      if (daysUntilExpiry < 0) status = 'expired';
      else if (daysUntilExpiry <= 30) status = 'critical';
      else status = 'warning';
      return { ...p, daysUntilExpiry, status };
    };

    // The admin dashboard widget loads this on every visit — only log views of
    // the report itself, not the widget's background fetch
    if (request.nextUrl.searchParams.get('source') !== 'dashboard') {
      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: AuditActions.EXPIRY_REPORT_VIEW,
        entityType: 'expiry_report',
        metadata: { alertDays },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        alertDays,
        totalExpired: expired.length,
        totalExpiring: expiring.length,
        expired: expired.map(mapProduct),
        expiring: expiring.map(mapProduct),
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Failed to fetch expiry report');
  }
}
