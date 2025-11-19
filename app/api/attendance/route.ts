import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * GET - Get attendance records for current user or all users (if manager+)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build query
    const query: any = { tenantId: user.tenantId };

    // If userId is provided and user is manager+, allow viewing other users
    if (userId && (user.role === 'owner' || user.role === 'admin' || user.role === 'manager')) {
      query.userId = userId;
    } else {
      // Otherwise, only show own records
      query.userId = user.userId;
    }

    // Date range filter
    if (startDate || endDate) {
      query.clockIn = {};
      if (startDate) {
        query.clockIn.$gte = new Date(startDate);
      }
      if (endDate) {
        query.clockIn.$lte = new Date(endDate);
      }
    }

    const attendances = await Attendance.find(query)
      .populate('userId', 'name email')
      .sort({ clockIn: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      success: true,
      data: attendances,
    });
  } catch (error: any) {
    console.error('Get attendance error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get attendance' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

/**
 * POST - Clock in or out
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    const body = await request.json();
    const { action, notes, location } = body; // action: 'clock-in' | 'clock-out'

    if (!action || !['clock-in', 'clock-out'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Action must be "clock-in" or "clock-out"' },
        { status: 400 }
      );
    }

    if (action === 'clock-in') {
      // Check if user already has an active session (clocked in but not out)
      const activeSession = await Attendance.findOne({
        userId: user.userId,
        tenantId: user.tenantId,
        clockOut: null,
      });

      if (activeSession) {
        return NextResponse.json(
          { success: false, error: 'You are already clocked in. Please clock out first.' },
          { status: 400 }
        );
      }

      // Create new attendance record
      const attendance = await Attendance.create({
        userId: user.userId,
        tenantId: user.tenantId,
        clockIn: new Date(),
        notes,
        location,
      });

      await createAuditLog(request, {
        tenantId: user.tenantId,
        action: AuditActions.ATTENDANCE_CLOCK_IN,
        entityType: 'attendance',
        entityId: attendance._id.toString(),
        metadata: { action: 'clock-in' },
      });

      return NextResponse.json({
        success: true,
        data: attendance,
      });
    } else {
      // Clock out
      const activeSession = await Attendance.findOne({
        userId: user.userId,
        tenantId: user.tenantId,
        clockOut: null,
      }).sort({ clockIn: -1 });

      if (!activeSession) {
        return NextResponse.json(
          { success: false, error: 'No active session found. Please clock in first.' },
          { status: 400 }
        );
      }

      // Update attendance with clock out time
      activeSession.clockOut = new Date();
      if (notes) {
        activeSession.notes = (activeSession.notes || '') + (activeSession.notes ? '\n' : '') + notes;
      }
      await activeSession.save();

      await createAuditLog(request, {
        tenantId: user.tenantId,
        action: AuditActions.ATTENDANCE_CLOCK_OUT,
        entityType: 'attendance',
        entityId: activeSession._id.toString(),
        metadata: { action: 'clock-out' },
      });

      return NextResponse.json({
        success: true,
        data: activeSession,
      });
    }
  } catch (error: any) {
    console.error('Attendance error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process attendance' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

