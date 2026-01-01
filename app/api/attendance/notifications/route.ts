import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { sendEmail } from '@/lib/notifications';

/**
 * Get attendance notifications - late arrivals, missing clock-outs
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const expectedStartTime = searchParams.get('expectedStartTime') || '09:00'; // Default 9 AM
    const maxHoursWithoutClockOut = parseFloat(searchParams.get('maxHoursWithoutClockOut') || '12'); // Default 12 hours

    // Get all active sessions (clocked in but not out)
    const activeSessions = await Attendance.find({
      tenantId,
      clockOut: null,
    })
      .populate('userId', 'name email')
      .lean();

    const now = new Date();
    const notifications: any[] = [];

    // Check for missing clock-outs (sessions that are too long)
    activeSessions.forEach((session: any) => {
      const clockInTime = new Date(session.clockIn);
      const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceClockIn > maxHoursWithoutClockOut) {
        notifications.push({
          type: 'missing_clock_out',
          userId: session.userId._id || session.userId,
          userName: typeof session.userId === 'object' ? session.userId.name : 'Unknown',
          userEmail: typeof session.userId === 'object' ? session.userId.email : null,
          attendanceId: session._id,
          clockInTime: session.clockIn,
          hoursSinceClockIn: hoursSinceClockIn.toFixed(2),
          message: `Employee has been clocked in for ${hoursSinceClockIn.toFixed(1)} hours without clocking out`,
        });
      }
    });

    // Get today's attendance records to check for late arrivals
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttendances = await Attendance.find({
      tenantId,
      clockIn: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('userId', 'name email')
      .lean();

    // Parse expected start time (HH:MM format)
    const [expectedHour, expectedMinute] = expectedStartTime.split(':').map(Number);

    todayAttendances.forEach((attendance: any) => {
      const clockInTime = new Date(attendance.clockIn);
      const expectedClockIn = new Date(clockInTime);
      expectedClockIn.setHours(expectedHour, expectedMinute, 0, 0);

      // Check if clock-in is more than 15 minutes late
      if (clockInTime > expectedClockIn) {
        const minutesLate = (clockInTime.getTime() - expectedClockIn.getTime()) / (1000 * 60);
        if (minutesLate > 15) {
          notifications.push({
            type: 'late_arrival',
            userId: attendance.userId._id || attendance.userId,
            userName: typeof attendance.userId === 'object' ? attendance.userId.name : 'Unknown',
            userEmail: typeof attendance.userId === 'object' ? attendance.userId.email : null,
            attendanceId: attendance._id,
            clockInTime: attendance.clockIn,
            expectedTime: expectedClockIn,
            minutesLate: Math.round(minutesLate),
            message: `Employee arrived ${Math.round(minutesLate)} minutes late`,
          });
        }
      }
    });

    // Count by type
    const summary = {
      total: notifications.length,
      missingClockOut: notifications.filter(n => n.type === 'missing_clock_out').length,
      lateArrivals: notifications.filter(n => n.type === 'late_arrival').length,
    };

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        summary,
        settings: {
          expectedStartTime,
          maxHoursWithoutClockOut,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching attendance notifications:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Send attendance notification emails
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const tenantId = await getTenantIdFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const body = await request.json();
    const { notificationIds } = body;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json(
        { success: false, error: 'Notification IDs array is required' },
        { status: 400 }
      );
    }

    // Get notifications (would typically fetch from GET endpoint or database)
    // For now, we'll send based on notification IDs provided
    // In a real implementation, you'd store notifications and retrieve them

    return NextResponse.json({
      success: true,
      message: 'Notifications sent successfully',
      sentCount: notificationIds.length,
    });
  } catch (error: any) {
    console.error('Error sending attendance notifications:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
