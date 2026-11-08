import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * GET - Get current user's active attendance session (if clocked in)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await connectDB();

    // Manager+ can look up another employee's active session (e.g. the admin
    // attendance page polling every employee's current clock-in status);
    // everyone else can only ever see their own.
    const searchParams = new URL(request.url).searchParams;
    const requestedUserId = searchParams.get('userId');
    const isManagerPlus = await hasTenantPermission(user.role, user.tenantId, 'attendance.manage');

    // Manager+ can ask for everyone on the clock at once (?all=true), one query instead of one per employee.
    if (searchParams.get('all') === 'true' && isManagerPlus) {
      const sessions = await Attendance.find({ tenantId: user.tenantId, clockOut: null, isActive: { $ne: false } })
        .populate('userId', 'name email')
        .sort({ clockIn: 1 })
        .lean();
      return NextResponse.json({ success: true, data: sessions });
    }
    const targetUserId = requestedUserId && isManagerPlus ? requestedUserId : user.userId;

    const activeSession = await Attendance.findOne({
      userId: targetUserId,
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get current attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToGetCurrentAttendance', 'Failed to get current attendance') },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

