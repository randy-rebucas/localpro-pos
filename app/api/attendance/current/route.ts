import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { requireAuth } from '@/lib/auth';

/**
 * GET - Get current user's active attendance session (if clocked in)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const activeSession = await Attendance.findOne({
      userId: user.userId,
      tenantId: user.tenantId,
      clockOut: null,
    })
      .sort({ clockIn: -1 })
      .lean();

    if (!activeSession) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    // Calculate current hours worked
    const now = new Date();
    const hoursWorked = (now.getTime() - new Date(activeSession.clockIn).getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(hoursWorked * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        ...activeSession,
        currentHours: roundedHours,
      },
    });
  } catch (error: any) {
    console.error('Get current attendance error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get current attendance' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

