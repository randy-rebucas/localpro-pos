import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest, TenantAccessViolationError, handleTenantAccessViolation } from '@/lib/api-tenant';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'today'; // today, week, month, all

    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate = new Date(0);
    }

    const dateFormat = period === 'today' ? 'hour' : 'day';

    const [statsAgg, paymentMethodGroups, timeSeriesRows, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, status: 'completed', createdAt: { gte: startDate, lte: endDate } },
        _sum: { total: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where: { tenantId, status: 'completed', createdAt: { gte: startDate, lte: endDate } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      dateFormat === 'hour'
        ? prisma.$queryRaw<Array<{ bucket: number; sales: number; transactions: bigint }>>`
            SELECT EXTRACT(HOUR FROM created_at)::int as bucket, SUM(total)::float as sales, COUNT(*) as transactions
            FROM transactions
            WHERE tenant_id = ${tenantId}::uuid AND status = 'completed' AND created_at >= ${startDate} AND created_at <= ${endDate}
            GROUP BY bucket
            ORDER BY bucket
          `
        : prisma.$queryRaw<Array<{ bucket: string; sales: number; transactions: bigint }>>`
            SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as bucket, SUM(total)::float as sales, COUNT(*) as transactions
            FROM transactions
            WHERE tenant_id = ${tenantId}::uuid AND status = 'completed' AND created_at >= ${startDate} AND created_at <= ${endDate}
            GROUP BY bucket
            ORDER BY bucket
          `,
      prisma.expense.aggregate({
        where: { tenantId, date: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const chartData = timeSeriesRows.map((row) => ({
      date: dateFormat === 'hour' ? `${String(row.bucket).padStart(2, '0')}:00` : String(row.bucket),
      sales: Number(row.sales) || 0,
      transactions: Number(row.transactions) || 0,
    }));

    const paymentMethods = paymentMethodGroups.map((g) => ({
      _id: g.paymentMethod,
      total: Number(g._sum.total ?? 0),
      count: g._count._all,
    }));

    const result = {
      totalSales: Number(statsAgg._sum.total ?? 0),
      totalTransactions: statsAgg._count._all,
      averageTransaction: Number(statsAgg._avg.total ?? 0),
      totalExpenses: Number(expenseAgg._sum.amount ?? 0),
      expenseCount: expenseAgg._count._all,
      paymentMethods,
      chartData,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    // Handle tenant access violations with redirect
    if (error instanceof TenantAccessViolationError) {
      return handleTenantAccessViolation(error, request);
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
