import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * Get attendance notifications - late arrivals, missing clock-outs
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    // Get tenant settings for notification defaults
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });

    const searchParams = request.nextUrl.searchParams;
    const attendanceSettings: any = (tenant?.settings as any)?.attendanceNotifications || {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    const expectedStartTime = searchParams.get('expectedStartTime') || attendanceSettings.expectedStartTime || '09:00'; // Default 9 AM
    const maxHoursWithoutClockOut = parseFloat(
      searchParams.get('maxHoursWithoutClockOut') ||
      String(attendanceSettings.maxHoursWithoutClockOut || 12)
    ); // Default 12 hours

    // Get all active sessions (clocked in but not out)
    const activeSessions = await prisma.attendance.findMany({
      where: { tenantId, clockOut: null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const now = new Date();
    const notifications: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

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
      where: { tenantId, clockIn: { gte: todayStart, lte: todayEnd } },
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
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching attendance notifications:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Send attendance notification emails
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const tenantId = await getTenantIdFromRequest(request);
    const t = await getValidationTranslatorFromRequest(request);

    if (!tenantId) {
      return NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 });
    }

    const body = await request.json();
    const { notifications } = body; // Array of notification objects

    if (!notifications || !Array.isArray(notifications) || notifications.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.notificationsArrayRequired', 'Notifications array is required') },
        { status: 400 }
      );
    }

    // Import the sendAttendanceNotification function
    const { sendAttendanceNotification } = await import('@/lib/notifications');

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Send email for each notification that has an email address
    for (const notification of notifications) {
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
            results.errors.push(`Failed to send email to ${notification.userEmail}`);
          }
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
          results.failed++;
          results.errors.push(`Error sending to ${notification.userEmail}: ${error.message}`);
        }
      } else {
        results.failed++;
        results.errors.push(`No email address for ${notification.userName}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${results.sent} email(s) successfully${results.failed > 0 ? `, ${results.failed} failed` : ''}`,
      results: {
        sent: results.sent,
        failed: results.failed,
        total: notifications.length,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error sending attendance notifications:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
