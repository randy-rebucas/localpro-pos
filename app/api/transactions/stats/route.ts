import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import { getTenantIdFromRequest, TenantAccessViolationError, handleTenantAccessViolation } from '@/lib/api-tenant';
import mongoose from 'mongoose';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);
    
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
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

    const matchQuery: Record<string, unknown> = {
      tenantId: tenantObjectId,
      status: 'completed',
      createdAt: { $gte: startDate, $lte: endDate },
    };

    const stats = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalTransactions: { $sum: 1 },
          averageTransaction: { $avg: '$total' },
        },
      },
    ]);

    const paymentMethodStats = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$paymentMethod',
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
    ]);

    // Time-series data for chart
    let timeSeriesGroup: Record<string, unknown>;
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

    const timeSeriesData = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: timeSeriesGroup,
          sales: { $sum: '$total' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format time-series data for chart
    const chartData = timeSeriesData.map((item) => {
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
    const expenseQuery: Record<string, unknown> = {
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
  } catch (error: unknown) {
    // Handle tenant access violations with redirect
    if (error instanceof TenantAccessViolationError) {
      return handleTenantAccessViolation(error, request);
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get stats' }, { status: 500 });
  }
}

