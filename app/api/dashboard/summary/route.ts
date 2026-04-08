import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import Transaction from '@/models/Transaction';
import Product from '@/models/Product';
import Booking from '@/models/Booking';
import User from '@/models/User';
import mongoose from 'mongoose';

/**
 * GET /api/dashboard/summary
 * Returns aggregated KPIs for the admin dashboard.
 * All data is scoped to the authenticated user's tenant.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    // Run all queries in parallel
    const [
      todayTxResult,
      monthTxResult,
      last30DailyTrend,
      topProducts,
      lowStockCount,
      activeStaffCount,
      pendingBookingsCount,
    ] = await Promise.all([
      // Today's KPIs
      Transaction.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            status: 'completed',
            createdAt: { $gte: todayStart },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            count: { $sum: 1 },
            totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
          },
        },
      ]),

      // This month's revenue
      Transaction.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            status: 'completed',
            createdAt: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
      ]),

      // Last 30 days daily revenue trend
      Transaction.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            status: 'completed',
            createdAt: { $gte: last30Start },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      // Top 10 products by revenue this month
      Transaction.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            status: 'completed',
            createdAt: { $gte: monthStart },
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            quantity: { $sum: '$items.quantity' },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),

      // Low stock count
      Product.countDocuments({
        tenantId,
        isActive: true,
        trackInventory: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      }),

      // Active staff
      User.countDocuments({ tenantId, isActive: true, role: { $in: ['cashier', 'manager', 'admin', 'owner'] } }),

      // Pending bookings today
      Booking.countDocuments({
        tenantId,
        status: { $in: ['pending', 'confirmed'] },
        startTime: { $gte: todayStart },
      }),
    ]);

    const today = todayTxResult[0] || { revenue: 0, count: 0, totalDiscount: 0 };
    const month = monthTxResult[0] || { revenue: 0, count: 0 };

    const salesTrend = last30DailyTrend.map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      date: `${d._id.year}-${String(d._id.month).padStart(2, '0')}-${String(d._id.day).padStart(2, '0')}`,
      revenue: d.revenue,
      transactions: d.count,
    }));

    return NextResponse.json({
      success: true,
      data: {
        today: {
          revenue: today.revenue,
          transactions: today.count,
          avgOrderValue: today.count > 0 ? today.revenue / today.count : 0,
          totalDiscount: today.totalDiscount,
        },
        month: {
          revenue: month.revenue,
          transactions: month.count,
        },
        salesTrend,
        topProducts,
        alerts: {
          lowStock: lowStockCount,
          pendingBookings: pendingBookingsCount,
          activeStaff: activeStaffCount,
        },
        generatedAt: now.toISOString(),
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to load dashboard summary');
  }
}
