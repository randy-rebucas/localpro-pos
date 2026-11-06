import { NET_SALE_TOTAL } from '@/lib/refund-plan';
import { NextRequest, NextResponse } from 'next/server';
import { REPORT_MAX_TIME_MS } from '@/lib/query-utils';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import Tenant from '@/models/Tenant';
import { requireTenantAccess, TenantAccessViolationError, handleTenantAccessViolation } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
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

    // Convert tenantId string to ObjectId for proper querying
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'today'; // today, week, month, all

    // Days and hours follow the store's clock, not the server's (Vercel runs UTC)
    const tenantDoc = await Tenant.findById(tenantId).select('settings.timezone').lean();
    const timezone = tenantDoc?.settings?.timezone || DEFAULT_TENANT_TIMEZONE;
    const localDate = { date: '$createdAt', timezone };

    let startDate: Date;
    const endDate = new Date();

    switch (period) {
      case 'today':
        startDate = getTenantDayBoundaries(undefined, timezone).start;
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

    const matchQuery: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      tenantId: tenantObjectId,
      status: 'completed',
      createdAt: { $gte: startDate, $lte: endDate },
    };

    // Time-series data for chart
    let timeSeriesGroup: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let dateFormat: string;

    if (period === 'today') {
      // Group by hour for today
      timeSeriesGroup = {
        $hour: localDate
      };
      dateFormat = 'hour';
    } else {
      // Group by day for week, month and all time
      timeSeriesGroup = {
        year: { $year: localDate },
        month: { $month: localDate },
        day: { $dayOfMonth: localDate }
      };
      dateFormat = 'day';
    }

    // Single aggregation: one $match scan, three facets computed in one round-trip
    // instead of three separate Transaction.aggregate() calls.
    const [facetResult] = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                totalSales: { $sum: NET_SALE_TOTAL },
                totalTransactions: { $sum: 1 },
                averageTransaction: { $avg: NET_SALE_TOTAL },
              },
            },
          ],
          paymentMethodStats: [
            {
              $group: {
                _id: '$paymentMethod',
                total: { $sum: NET_SALE_TOTAL },
                count: { $sum: 1 },
              },
            },
          ],
          timeSeriesData: [
            {
              $group: {
                _id: timeSeriesGroup,
                sales: { $sum: NET_SALE_TOTAL },
                transactions: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]).option({ maxTimeMS: REPORT_MAX_TIME_MS });

    const stats = facetResult.stats;
    const paymentMethodStats = facetResult.paymentMethodStats;
    const timeSeriesData = facetResult.timeSeriesData;

    // Format time-series data for chart
    const chartData = timeSeriesData.map((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let label: string;
      if (dateFormat === 'hour') {
        const hour = item._id;
        label = `${String(hour).padStart(2, '0')}:00`;
      } else {
        const { year, month, day } = item._id;
        label = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      const salesValue = typeof item.sales === 'number' ? item.sales : parseFloat(String(item.sales)) || 0;
      const transactionsValue = typeof item.transactions === 'number' ? item.transactions : parseInt(String(item.transactions)) || 0;
      return {
        date: label,
        sales: salesValue,
        transactions: transactionsValue,
      };
    });

    // Get expense statistics for the same period
    const expenseQuery: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      tenantId: tenantObjectId,
      date: { $gte: startDate, $lte: endDate },
    };
    
    const expenseStats = await Expense.aggregate([
      { $match: expenseQuery },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          expenseCount: { $sum: 1 },
        },
      },
    ]);

    const result = {
      totalSales: stats[0]?.totalSales || 0,
      totalTransactions: stats[0]?.totalTransactions || 0,
      averageTransaction: stats[0]?.averageTransaction || 0,
      totalExpenses: expenseStats[0]?.totalExpenses || 0,
      expenseCount: expenseStats[0]?.expenseCount || 0,
      paymentMethods: paymentMethodStats,
      chartData,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Handle tenant access violations with redirect
    if (error instanceof TenantAccessViolationError) {
      return handleTenantAccessViolation(error, request);
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

