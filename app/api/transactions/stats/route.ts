import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import { requireTenantAccess, TenantAccessViolationError, handleTenantAccessViolation } from '@/lib/api-tenant';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
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
        $hour: '$createdAt'
      };
      dateFormat = 'hour';
    } else if (period === 'week' || period === 'month') {
      // Group by day for week/month
      timeSeriesGroup = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' }
      };
      dateFormat = 'day';
    } else {
      // Group by day for all time
      timeSeriesGroup = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' }
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
                totalSales: { $sum: '$total' },
                totalTransactions: { $sum: 1 },
                averageTransaction: { $avg: '$total' },
              },
            },
          ],
          paymentMethodStats: [
            {
              $group: {
                _id: '$paymentMethod',
                total: { $sum: '$total' },
                count: { $sum: 1 },
              },
            },
          ],
          timeSeriesData: [
            {
              $group: {
                _id: timeSeriesGroup,
                sales: { $sum: '$total' },
                transactions: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

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

