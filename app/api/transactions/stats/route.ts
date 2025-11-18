import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getTenantIdFromRequest } from '@/lib/api-tenant';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
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

    const matchQuery: any = {
      tenantId,
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

    const result = {
      totalSales: stats[0]?.totalSales || 0,
      totalTransactions: stats[0]?.totalTransactions || 0,
      averageTransaction: stats[0]?.averageTransaction || 0,
      paymentMethods: paymentMethodStats,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

