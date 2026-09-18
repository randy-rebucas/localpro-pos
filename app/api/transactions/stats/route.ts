import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTenantAccess, TenantAccessViolationError, handleTenantAccessViolation } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';

export async function GET(request: NextRequest) {
  try {
    // Require authentication — financial data must not be public
    let tenantId: string;
    let role: string;
    try {
      const tenantAccess = await requireTenantAccess(request);
      tenantId = tenantAccess.tenantId;
      role = tenantAccess.user.role;
    } catch (authError: unknown) {
      const t = await getValidationTranslatorFromRequest(request);
      const msg = authError instanceof Error ? authError.message : '';
      return NextResponse.json(
        { success: false, error: msg.includes('Forbidden') ? t('validation.forbidden', 'Forbidden') : t('validation.unauthorized', 'Unauthorized') },
        { status: msg.includes('Forbidden') ? 403 : 401 }
      );
    }

    const t = await getValidationTranslatorFromRequest(request);
    if (!(await hasTenantPermission(role, tenantId, 'transactions.view'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden') },
        { status: 403 }
      );
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

    const where = {
      tenantId,
      status: 'completed' as const,
      createdAt: { gte: startDate, lte: endDate },
    };

    // Overall stats + per-payment-method breakdown + raw rows for the
    // time-series bucketing (bucketing itself is done in JS below — Prisma
    // has no native date_trunc grouping, and the volumes here don't warrant
    // a raw SQL query).
    const [aggStats, paymentMethodGroups, rows, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where,
        _sum: { total: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.transaction.findMany({
        where,
        select: { createdAt: true, total: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, date: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const paymentMethodStats = paymentMethodGroups.map((g) => ({
      _id: g.paymentMethod,
      total: Number(g._sum.total ?? 0),
      count: g._count._all,
    }));

    // Bucket the raw rows the same way the old $group by hour/day did.
    const bucketMap = new Map<string, { sales: number; transactions: number }>();
    const isHourBucket = period === 'today';
    for (const row of rows) {
      const d = row.createdAt;
      const key = isHourBucket
        ? String(d.getHours())
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = bucketMap.get(key) || { sales: 0, transactions: 0 };
      bucket.sales += Number(row.total);
      bucket.transactions += 1;
      bucketMap.set(key, bucket);
    }
    const chartData = Array.from(bucketMap.entries())
      .sort(([a], [b]) => (isHourBucket ? Number(a) - Number(b) : a.localeCompare(b)))
      .map(([key, v]) => ({
        date: isHourBucket ? `${key.padStart(2, '0')}:00` : key,
        sales: v.sales,
        transactions: v.transactions,
      }));

    const result = {
      totalSales: Number(aggStats._sum.total ?? 0),
      totalTransactions: aggStats._count._all,
      averageTransaction: Number(aggStats._avg.total ?? 0),
      totalExpenses: Number(expenseAgg._sum.amount ?? 0),
      expenseCount: expenseAgg._count._all,
      paymentMethods: paymentMethodStats,
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
