import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';
import type { Prisma } from '@prisma/client';

function toApi(attendance: any) {
  const { id, user, ...rest } = attendance;
  return {
    _id: id,
    ...rest,
    userId: user ? { _id: user.id, name: user.name, email: user.email } : rest.userId,
  };
}

/**
 * GET - Get attendance records for current user or all users (if manager+)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(1, rawLimit), 200);

    const where: Prisma.AttendanceWhereInput = { tenantId: user.tenantId, isActive: true };

    const isManagerPlus = await hasTenantPermission(user.role, user.tenantId, 'attendance.manage');

    if (userId && isManagerPlus) {
      where.userId = userId;
    } else if (!isManagerPlus) {
      where.userId = user.userId;
    }

    if (startDate || endDate) {
      where.clockIn = {};
      if (startDate) {
        (where.clockIn as Prisma.DateTimeFilter).gte = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        (where.clockIn as Prisma.DateTimeFilter).lte = endOfDay;
      }
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { clockIn: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: attendances.map(toApi),
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Get attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToGetAttendance', 'Failed to get attendance') },
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

    const body = await request.json();
    const { action, notes, location } = body; // action: 'clock-in' | 'clock-out'

    const t = await getValidationTranslatorFromRequest(request);
    if (!action || !['clock-in', 'clock-out'].includes(action)) {
      return NextResponse.json(
        { success: false, error: t('validation.attendanceActionRequired', 'Action must be "clock-in" or "clock-out"') },
        { status: 400 }
      );
    }

    if (action === 'clock-in') {
      const activeSession = await prisma.attendance.findFirst({
        where: { userId: user.userId, tenantId: user.tenantId, clockOut: null },
      });

      if (activeSession) {
        return NextResponse.json(
          { success: false, error: t('validation.alreadyClockedIn', 'You are already clocked in. Please clock out first.') },
          { status: 400 }
        );
      }

      const attendance = await prisma.attendance.create({
        data: {
          userId: user.userId,
          tenantId: user.tenantId,
          clockIn: new Date(),
          notes,
          location,
        },
      });

      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: AuditActions.ATTENDANCE_CLOCK_IN,
        entityType: 'attendance',
        entityId: attendance.id,
        metadata: { action: 'clock-in' },
      });

      return NextResponse.json({
        success: true,
        data: toApi(attendance),
      });
    } else {
      const activeSession = await prisma.attendance.findFirst({
        where: { userId: user.userId, tenantId: user.tenantId, clockOut: null },
        orderBy: { clockIn: 'desc' },
      });

      if (!activeSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noActiveSession', 'No active session found. Please clock in first.') },
          { status: 400 }
        );
      }

      const newNotes = notes
        ? (activeSession.notes || '') + (activeSession.notes ? '\n' : '') + notes
        : activeSession.notes;

      const updated = await prisma.attendance.update({
        where: { id: activeSession.id },
        data: { clockOut: new Date(), notes: newNotes },
      });

      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: AuditActions.ATTENDANCE_CLOCK_OUT,
        entityType: 'attendance',
        entityId: updated.id,
        metadata: { action: 'clock-out' },
      });

      return NextResponse.json({
        success: true,
        data: toApi(updated),
      });
    }
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    return NextResponse.json(
      { success: false, error: error.message || t('validation.failedToProcessAttendance', 'Failed to process attendance') },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
