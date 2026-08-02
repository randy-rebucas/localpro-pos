import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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

    const requestedUserId = new URL(request.url).searchParams.get('userId');
    const isManagerPlus = await hasTenantPermission(user.role, user.tenantId, 'attendance.manage');
    const targetUserId = requestedUserId && isManagerPlus ? requestedUserId : user.userId;

    const activeSession = await prisma.attendance.findFirst({
      where: { userId: targetUserId, tenantId: user.tenantId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!activeSession) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    const now = new Date();
    const hoursWorked = (now.getTime() - new Date(activeSession.clockIn).getTime()) / (1000 * 60 * 60);
    const roundedHours = Math.round(hoursWorked * 100) / 100;

    const { id, ...rest } = activeSession;

    return NextResponse.json({
      success: true,
      data: {
        _id: id,
        ...rest,
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
