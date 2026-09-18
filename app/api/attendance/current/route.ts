import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
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

    // Manager+ can look up another employee's active session (e.g. the admin
    // attendance page polling every employee's current clock-in status);
    // everyone else can only ever see their own.
    const requestedUserId = new URL(request.url).searchParams.get('userId');
    const isManagerPlus = await hasTenantPermission(user.role, user.tenantId, 'attendance.manage');
    const targetUserId = requestedUserId && isManagerPlus ? requestedUserId : user.userId;

    const activeSession = await prisma.attendance.findFirst({
      where: {
        userId: targetUserId,
        tenantId: user.tenantId,
        clockOut: null,
      },
      orderBy: { clockIn: 'desc' },
    });

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
  } catch (error: unknown) {
    logger.error('Get current attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message || t('validation.failedToGetCurrentAttendance', 'Failed to get current attendance') },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
