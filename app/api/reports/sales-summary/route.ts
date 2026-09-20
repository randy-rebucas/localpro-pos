import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { checkFeatureAccess } from '@/lib/subscription';
import { logger } from '@/lib/logger';
import { resolveTenantDateRange, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';

/**
 * Reads from the pre-aggregated sales summary tables (daily_sales_summaries,
 * monthly_sales_summaries, product_sales_summaries, branch_sales_summaries,
 * cashier_sales_summaries — populated nightly by
 * lib/automations/sales-reporting-aggregation.ts) instead of aggregating raw
 * Transaction/TransactionItem rows. Because the aggregation job only runs
 * once a day, this endpoint reflects data through end of the previous UTC
 * day — it is for historical trend reporting, not "today so far" (use
 * /api/reports/sales or /api/transactions/stats for that).
 */
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

    try {
      await checkFeatureAccess(tenantId.toString(), 'enableReports');
    } catch (featureError: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      return NextResponse.json(
        { success: false, error: featureError.message },
        { status: 403 }
      );
    }

    const tenantSettings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });
    const tenantTz = tenantSettings?.timezone || DEFAULT_TENANT_TIMEZONE;

    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get('period') || 'daily') as 'daily' | 'monthly';
    const breakdown = searchParams.get('breakdown') as 'branch' | 'product' | 'cashier' | null;
    const branchId = searchParams.get('branchId') || undefined;

    if (period === 'monthly') {
      const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : new Date().getFullYear();
      const rows = await prisma.monthlySalesSummary.findMany({
        where: { tenantId, year, branchId: branchId ?? null },
        orderBy: { month: 'asc' },
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          year: r.year,
          month: r.month,
          transactionCount: r.transactionCount,
          itemCount: r.itemCount,
          grossSales: Number(r.grossSales),
          discountTotal: Number(r.discountTotal),
          taxTotal: Number(r.taxTotal),
          netSales: Number(r.netSales),
        })),
      });
    }

    const { startDate, endDate } = resolveTenantDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      tenantTz
    );

    if (breakdown === 'branch') {
      const rows = await prisma.branchSalesSummary.findMany({
        where: { tenantId, date: { gte: startDate, lte: endDate } },
        orderBy: [{ date: 'asc' }],
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          branchId: r.branchId,
          transactionCount: r.transactionCount,
          grossSales: Number(r.grossSales),
          netSales: Number(r.netSales),
        })),
      });
    }

    if (breakdown === 'product') {
      const rows = await prisma.productSalesSummary.findMany({
        where: { tenantId, branchId: branchId ?? undefined, date: { gte: startDate, lte: endDate } },
        orderBy: [{ date: 'asc' }],
        include: { product: { select: { name: true } } },
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          branchId: r.branchId,
          productId: r.productId,
          productName: r.product.name,
          quantitySold: r.quantitySold,
          grossSales: Number(r.grossSales),
          netSales: Number(r.netSales),
        })),
      });
    }

    if (breakdown === 'cashier') {
      const rows = await prisma.cashierSalesSummary.findMany({
        where: { tenantId, branchId: branchId ?? undefined, date: { gte: startDate, lte: endDate } },
        orderBy: [{ date: 'asc' }],
        include: { user: { select: { name: true } } },
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          date: r.date.toISOString().slice(0, 10),
          branchId: r.branchId,
          userId: r.userId,
          userName: r.user.name,
          transactionCount: r.transactionCount,
          grossSales: Number(r.grossSales),
          netSales: Number(r.netSales),
        })),
      });
    }

    // Default: tenant-wide (or single-branch) daily totals
    const rows = await prisma.dailySalesSummary.findMany({
      where: { tenantId, branchId: branchId ?? null, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        transactionCount: r.transactionCount,
        itemCount: r.itemCount,
        grossSales: Number(r.grossSales),
        discountTotal: Number(r.discountTotal),
        taxTotal: Number(r.taxTotal),
        netSales: Number(r.netSales),
      })),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching sales summary report:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
