import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import { getTenantIdFromRequest } from '@/lib/api-tenant';
import { requireAuth } from '@/lib/auth';
import { hasTenantPermission } from '@/lib/permissions-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTenantSettingsById } from '@/lib/tenant';
import { getTenantDayBoundaries } from '@/lib/timezone';
import { findAttendanceAlerts } from '@/lib/attendance-alerts';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { getValidationTranslatorFromRequest } from '@/lib/validation-translations';
import { logger } from '@/lib/logger';

/**
 * Resolve the caller and the store, and require attendance.manage: the alerts list
 * every flagged employee's name and email, and POST emails them.
 */
async function authorize(request: NextRequest) {
  const user = await requireAuth(request);
  await connectDB();
  const t = await getValidationTranslatorFromRequest(request);
  // getTenantIdFromRequest pins this to the signed-in user's tenant.
  const tenantId = await getTenantIdFromRequest(request);
  if (!tenantId) {
    return { error: NextResponse.json({ success: false, error: t('validation.tenantNotFound', 'Tenant not found') }, { status: 404 }) };
  }
  if (!(await hasTenantPermission(user.role, tenantId, 'attendance.manage'))) {
    return { error: NextResponse.json({ success: false, error: t('validation.forbidden', 'Forbidden: Insufficient permissions') }, { status: 403 }) };
  }
  return { user, tenantId, t };
}

/** Today's alerts for the store, using the query's thresholds or the saved ones. */
async function buildAlerts(request: NextRequest, tenantId: string) {
  const settings = await getTenantSettingsById(tenantId);
  const saved = settings?.attendanceNotifications || {};
  const params = request.nextUrl.searchParams;
  const expectedStartTime = params.get('expectedStartTime') || saved.expectedStartTime || '09:00';
  const parsedMax = parseFloat(params.get('maxHoursWithoutClockOut') || String(saved.maxHoursWithoutClockOut || 12));
  const maxHoursWithoutClockOut = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 12;
  const timeZone = settings?.timezone || 'Asia/Manila';

  const today = getTenantDayBoundaries(undefined, timeZone);
  const [openSessions, todaysSessions] = await Promise.all([
    Attendance.find({ tenantId, clockOut: null, isActive: { $ne: false } }).populate('userId', 'name email').lean(),
    Attendance.find({ tenantId, clockIn: { $gte: today.start, $lte: today.end }, isActive: { $ne: false } }).populate('userId', 'name email').lean(),
  ]);

  const notifications = findAttendanceAlerts({
    openSessions,
    todaysSessions,
    now: new Date(),
    timeZone,
    expectedStartTime,
    maxHours: maxHoursWithoutClockOut,
  });
  return { settings, notifications, expectedStartTime, maxHoursWithoutClockOut };
}

/**
 * Get attendance notifications - late arrivals, missing clock-outs
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ('error' in auth) return auth.error;

    const { notifications, expectedStartTime, maxHoursWithoutClockOut } = await buildAlerts(request, auth.tenantId);
    const summary = {
      total: notifications.length,
      missingClockOut: notifications.filter((n) => n.type === 'missing_clock_out').length,
      lateArrivals: notifications.filter((n) => n.type === 'late_arrival').length,
    };

    return NextResponse.json({
      success: true,
      data: { notifications, summary, settings: { expectedStartTime, maxHoursWithoutClockOut } },
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error fetching attendance notifications:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch notifications' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

/**
 * Email the flagged employees. Recipients, names and wording are rebuilt here from the
 * store's own records; the body may only narrow the list by attendance id. Taking them
 * from the request would let a caller send any text to any address.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ('error' in auth) return auth.error;
    const { tenantId, t } = auth;

    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = checkRateLimit(`write:attendance-notify:${tenantId}:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const requested: string[] | null = Array.isArray(body?.attendanceIds)
      ? body.attendanceIds.map(String)
      : Array.isArray(body?.notifications)
        ? body.notifications.map((n: { attendanceId?: unknown }) => String(n?.attendanceId))
        : null;

    const { settings, notifications } = await buildAlerts(request, tenantId);
    if (!settings?.emailNotifications) {
      return NextResponse.json(
        { success: false, error: t('validation.emailNotificationsDisabled', 'Email notifications are turned off for this store. Turn them on under Settings → Notifications.') },
        { status: 400 }
      );
    }

    const targets = notifications.filter((n) => n.userEmail && (!requested || requested.includes(n.attendanceId)));
    if (targets.length === 0) {
      return NextResponse.json(
        { success: false, error: t('validation.notificationsArrayRequired', 'No notifications with an email address to send') },
        { status: 400 }
      );
    }

    const { sendAttendanceNotification } = await import('@/lib/notifications');
    let sent = 0;
    let failed = 0;
    for (const n of targets) {
      try {
        const ok = await sendAttendanceNotification({
          userName: n.userName,
          userEmail: n.userEmail as string,
          type: n.type,
          clockInTime: n.clockInTime,
          hoursSinceClockIn: n.hoursSinceClockIn ? parseFloat(n.hoursSinceClockIn) : undefined,
          minutesLate: n.minutesLate,
          expectedTime: n.expectedTime,
          message: n.message,
        }, settings);
        if (ok) sent++;
        else failed++;
      } catch (error) {
        failed++;
        logger.error('Attendance notification email failed:', error);
      }
    }

    await createAuditLog(request, {
      tenantId,
      action: AuditActions.UPDATE,
      entityType: 'attendance_notification',
      entityId: tenantId,
      changes: { emailed: sent, failed, attendanceIds: targets.map((n) => n.attendanceId) },
    });

    return NextResponse.json({
      success: sent > 0,
      ...(sent === 0 ? { error: 'No emails could be sent. Check the email settings.' } : {}),
      message: `Sent ${sent} email(s)${failed > 0 ? `, ${failed} failed` : ''}`,
      results: { sent, failed, total: targets.length },
    }, { status: sent > 0 ? 200 : 502 });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.error('Error sending attendance notifications:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send notifications' },
      { status: error.message === 'Unauthorized' ? 401 : 500 }
    );
  }
}
