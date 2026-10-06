import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTenantIdForUser } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sendAttendanceNotification } from '@/lib/notifications';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

interface AttendanceNotification {
  type: 'missing_clock_out' | 'late_arrival';
  userId: string;
  userName: string;
  userEmail: string | null;
  attendanceId: string;
  clockInTime: Date;
  expectedTime?: Date;
  hoursSinceClockIn?: string;
  minutesLate?: number;
  message: string;
}

/** Hard cap on emails per POST, so one request can't fan out unbounded mail. */
const MAX_EMAILS_PER_REQUEST = 100;

/**
 * Build the tenant's current notifications from attendance records.
 * Shared by GET (listing) and POST (sending) so emails only ever go to
 * addresses read from the database, never ones supplied by the client.
 */
async function buildNotifications(tenantId: string, searchParams: URLSearchParams) {
  const tenantSettings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      attendanceExpectedStartTime: true,
      attendanceMaxHoursWithoutClockOut: true,
    },
  });

  const expectedStartTime =
    searchParams.get('expectedStartTime') || tenantSettings?.attendanceExpectedStartTime || '09:00'; // Default 9 AM
  const maxHoursWithoutClockOut = parseFloat(
    searchParams.get('maxHoursWithoutClockOut') ||
    String(tenantSettings?.attendanceMaxHoursWithoutClockOut ?? 12)
  ); // Default 12 hours

  // Get all active sessions (clocked in but not out)
  const activeSessions = await prisma.attendance.findMany({
    where: {
      tenantId,
      clockOut: null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const now = new Date();
  const notifications: AttendanceNotification[] = [];

  // Check for missing clock-outs (sessions that are too long)
  activeSessions.forEach((session) => {
    const clockInTime = new Date(session.clockIn);
    const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceClockIn > maxHoursWithoutClockOut) {
      notifications.push({
        type: 'missing_clock_out',
        userId: session.user?.id || session.userId,
        userName: session.user?.name || 'Unknown',
        userEmail: session.user?.email || null,
        attendanceId: session.id,
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

  const todayAttendances = await prisma.attendance.findMany({
    where: {
      tenantId,
      clockIn: { gte: todayStart, lte: todayEnd },
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Parse expected start time (HH:MM format)
  const [expectedHour, expectedMinute] = expectedStartTime.split(':').map(Number);

  todayAttendances.forEach((attendance) => {
    const clockInTime = new Date(attendance.clockIn);
    const expectedClockIn = new Date(clockInTime);
    expectedClockIn.setHours(expectedHour, expectedMinute, 0, 0);

    // Check if clock-in is more than 15 minutes late
    if (clockInTime > expectedClockIn) {
      const minutesLate = (clockInTime.getTime() - expectedClockIn.getTime()) / (1000 * 60);
      if (minutesLate > 15) {
        notifications.push({
          type: 'late_arrival',
          userId: attendance.user?.id || attendance.userId,
          userName: attendance.user?.name || 'Unknown',
          userEmail: attendance.user?.email || null,
          attendanceId: attendance.id,
          clockInTime: attendance.clockIn,
          expectedTime: expectedClockIn,
          minutesLate: Math.round(minutesLate),
          message: `Employee arrived ${Math.round(minutesLate)} minutes late`,
        });
      }
    }
  });

  return { notifications, expectedStartTime, maxHoursWithoutClockOut };
}

/**
 * Get attendance notifications - late arrivals, missing clock-outs
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const rl = checkRateLimit(`attendance-notifications-list:${user.tenantId}`, 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const tenantId = await getTenantIdForUser(request, user);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'attendance.view'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const { notifications, expectedStartTime, maxHoursWithoutClockOut } = await buildNotifications(
      tenantId,
      request.nextUrl.searchParams
    );

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
  } catch (error: unknown) {
    logger.error('Error fetching attendance notifications:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Send attendance notification emails.
 * Body: { notifications: [{ attendanceId, type }] } — only the IDs are read.
 * Recipients, names and message text are rebuilt server-side from the
 * tenant's attendance records; any other client-supplied field is ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const rl = checkRateLimit(`attendance-notifications-send:${user.tenantId}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const tenantId = await getTenantIdForUser(request, user);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    if (!(await hasTenantPermission(user.role, tenantId, 'attendance.view'))) {
      return NextResponse.json(
        { success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') },
        { status: 403 }
      );
    }

    const body = await request.json();
    const requested = body?.notifications;

    if (!requested || !Array.isArray(requested) || requested.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.notificationsArrayRequired', 'Notifications array is required') },
        { status: 400 }
      );
    }

    const requestedKeys = new Set(
      requested
        .filter((n: unknown): n is { attendanceId: string; type: string } =>
          !!n && typeof (n as { attendanceId?: unknown }).attendanceId === 'string'
            && typeof (n as { type?: unknown }).type === 'string')
        .map((n) => `${n.attendanceId}:${n.type}`)
    );

    const { notifications } = await buildNotifications(tenantId, request.nextUrl.searchParams);
    const toSend = notifications
      .filter((n) => requestedKeys.has(`${n.attendanceId}:${n.type}`))
      .slice(0, MAX_EMAILS_PER_REQUEST);

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Send email for each notification that has an email address
    for (const notification of toSend) {
      if (notification.userEmail) {
        try {
          const sent = await sendAttendanceNotification({
            userName: notification.userName,
            userEmail: notification.userEmail,
            type: notification.type,
            clockInTime: notification.clockInTime,
            hoursSinceClockIn: notification.hoursSinceClockIn ? parseFloat(notification.hoursSinceClockIn) : undefined,
            minutesLate: notification.minutesLate,
            expectedTime: notification.expectedTime,
            message: notification.message,
          });

          if (sent) {
            results.sent++;
          } else {
            results.failed++;
            results.errors.push(`Failed to send email to ${notification.userName}`);
          }
        } catch (error: unknown) {
          results.failed++;
          const message = error instanceof Error ? error.message : String(error);
          results.errors.push(`Error sending to ${notification.userName}: ${message}`);
        }
      } else {
        results.failed++;
        results.errors.push(`No email address for ${notification.userName}`);
      }
    }

    await createAuditLog(request, {
      tenantId,
      userId: user.userId,
      action: AuditActions.ATTENDANCE_NOTIFICATIONS_SEND,
      entityType: 'attendance',
      metadata: {
        requested: requested.length,
        matched: toSend.length,
        sent: results.sent,
        failed: results.failed,
        attendanceIds: toSend.map((n) => n.attendanceId),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Sent ${results.sent} email(s) successfully${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      results: {
        sent: results.sent,
        failed: results.failed,
        total: toSend.length,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });
  } catch (error: unknown) {
    logger.error('Error sending attendance notifications:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
