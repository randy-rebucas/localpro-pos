import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requireTenantAccess } from '@/lib/api-tenant';
import { handleApiError } from '@/lib/error-handler';
import Transaction from '@/models/Transaction';
import Attendance from '@/models/Attendance';
import mongoose from 'mongoose';

/**
 * GET /api/reports/staff-performance
 * Returns per-staff sales and attendance metrics for a date range.
 * Query params: startDate, endDate (ISO strings, defaults to current month)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { tenantId } = await requireTenantAccess(request);

    const params = request.nextUrl.searchParams;
    const now = new Date();
    const startDate = params.get('startDate')
      ? new Date(params.get('startDate')!)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = params.get('endDate')
      ? new Date(params.get('endDate')!)
      : now;

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const tenantObjId = new mongoose.Types.ObjectId(tenantId);

    const [salesMetrics, attendanceMetrics] = await Promise.all([
      // Sales grouped by staffId
      Transaction.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            status: 'completed',
            createdAt: { $gte: startDate, $lte: endDate },
            userId: { $exists: true },
          },
        },
        {
          $group: {
            _id: '$userId',
            revenue: { $sum: '$total' },
            transactions: { $sum: 1 },
            totalDiscount: { $sum: { $ifNull: ['$discountAmount', 0] } },
            avgOrderValue: { $avg: '$total' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'staff',
          },
        },
        { $unwind: { path: '$staff', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            staffId: { $toString: '$_id' },
            name: { $ifNull: ['$staff.name', 'Unknown'] },
            email: { $ifNull: ['$staff.email', ''] },
            role: { $ifNull: ['$staff.role', ''] },
            revenue: 1,
            transactions: 1,
            totalDiscount: 1,
            avgOrderValue: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      // Attendance — total hours worked per staff
      Attendance.aggregate([
        {
          $match: {
            tenantId: tenantObjId,
            clockIn: { $gte: startDate, $lte: endDate },
            totalHours: { $exists: true },
          },
        },
        {
          $group: {
            _id: '$userId',
            totalHours: { $sum: '$totalHours' },
            daysWorked: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Merge attendance into sales metrics
    const attendanceMap = new Map(
      attendanceMetrics.map((a: any) => [a._id.toString(), a]) // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    const merged = salesMetrics.map((s: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const att = attendanceMap.get(s.staffId?.toString());
      return {
        ...s,
        totalHours: att?.totalHours ?? 0,
        daysWorked: att?.daysWorked ?? 0,
        revenuePerHour: att?.totalHours > 0 ? s.revenue / att.totalHours : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: merged,
      meta: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        staffCount: merged.length,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    return handleApiError(error, 'Failed to load staff performance report');
  }
}
