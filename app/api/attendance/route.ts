import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

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

    // Build query
    const where: Record<string, unknown> = { tenantId: user.tenantId, isActive: { not: false } };

    const isManagerPlus = await hasTenantPermission(user.role, user.tenantId, 'attendance.manage');

    if (userId && isManagerPlus) {
      // Manager+ viewing a specific employee
      where.userId = userId;
    } else if (!isManagerPlus) {
      // Non-managers can only see their own records
      where.userId = user.userId;
    }
    // Manager+ with no userId filter: show all tenant records (no userId constraint)

    // Date range filter
    if (startDate || endDate) {
      where.clockIn = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate
          ? {
              lte: (() => {
                const endOfDay = new Date(endDate);
                endOfDay.setHours(23, 59, 59, 999);
                return endOfDay;
              })(),
            }
          : {}),
      };
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { clockIn: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: attendances,
    });
  } catch (error: unknown) {
    logger.error('Get attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message || t('validation.failedToGetAttendance', 'Failed to get attendance') },
      { status: message === 'Unauthorized' ? 401 : 500 }
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
      // Check if user already has an active session (clocked in but not out)
      const activeSession = await prisma.attendance.findFirst({
        where: {
          userId: user.userId,
          tenantId: user.tenantId,
          clockOut: null,
        },
      });

      if (activeSession) {
        return NextResponse.json(
          { success: false, error: t('validation.alreadyClockedIn', 'You are already clocked in. Please clock out first.') },
          { status: 400 }
        );
      }

      // Create new attendance record. The unique partial index on
      // { userId, tenantId, clockOut: null } is the real guard against a
      // double clock-in race; the findFirst check above is just a fast path
      // for the common case and returns a friendly error.
      let attendance;
      try {
        attendance = await prisma.attendance.create({
          data: {
            id: randomUUID(),
            userId: user.userId,
            tenantId: user.tenantId,
            clockIn: new Date(),
            notes: notes ?? undefined,
            locationLatitude: location?.latitude ?? undefined,
            locationLongitude: location?.longitude ?? undefined,
            locationAddress: location?.address ?? undefined,
          },
        });
      } catch (createError: unknown) {
        if (
          createError &&
          typeof createError === 'object' &&
          'code' in createError &&
          (createError as { code?: string }).code === 'P2002'
        ) {
          return NextResponse.json(
            { success: false, error: t('validation.alreadyClockedIn', 'You are already clocked in. Please clock out first.') },
            { status: 400 }
          );
        }
        throw createError;
      }

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
        data: attendance,
      });
    } else {
      // Clock out
      const activeSession = await prisma.attendance.findFirst({
        where: {
          userId: user.userId,
          tenantId: user.tenantId,
          clockOut: null,
        },
        orderBy: { clockIn: 'desc' },
      });

      if (!activeSession) {
        return NextResponse.json(
          { success: false, error: t('validation.noActiveSession', 'No active session found. Please clock in first.') },
          { status: 400 }
        );
      }

      // Update attendance with clock out time
      const combinedNotes = notes
        ? (activeSession.notes || '') + (activeSession.notes ? '\n' : '') + notes
        : activeSession.notes;

      const updatedSession = await prisma.attendance.update({
        where: { id: activeSession.id },
        data: {
          clockOut: new Date(),
          notes: combinedNotes,
        },
      });

      await createAuditLog(request, {
        tenantId: user.tenantId,
        userId: user.userId,
        action: AuditActions.ATTENDANCE_CLOCK_OUT,
        entityType: 'attendance',
        entityId: updatedSession.id,
        metadata: { action: 'clock-out' },
      });

      return NextResponse.json({
        success: true,
        data: updatedSession,
      });
    }
  } catch (error: unknown) {
    logger.error('Attendance error:', error);
    const t = await getValidationTranslatorFromRequest(request);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message || t('validation.failedToProcessAttendance', 'Failed to process attendance') },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
