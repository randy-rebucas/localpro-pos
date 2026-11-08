import { toTenantDateString, tenantWallTimeToDate } from '@/lib/timezone';

/** Minutes after the expected start before a clock-in counts as late. */
export const LATE_GRACE_MINUTES = 15;

export interface AlertSession {
  _id: unknown;
  clockIn: Date | string;
  userId: unknown;
}

export interface AttendanceAlert {
  type: 'missing_clock_out' | 'late_arrival';
  userId: string;
  userName: string;
  userEmail: string | null;
  attendanceId: string;
  clockInTime: Date | string;
  hoursSinceClockIn?: string;
  minutesLate?: number;
  expectedTime?: Date;
  message: string;
}

function who(userId: unknown) {
  if (userId && typeof userId === 'object' && 'name' in userId) {
    const u = userId as { _id?: unknown; name?: string; email?: string };
    return { id: String(u._id ?? ''), name: u.name || 'Unknown', email: u.email || null };
  }
  return { id: String(userId ?? ''), name: 'Unknown', email: null };
}

/**
 * Late arrivals and missing clock-outs, judged at the store: "today" and the expected start
 * time are read in `timeZone`, so a 09:00 start means 09:00 at the store whatever zone the
 * server runs in.
 *
 * - `openSessions`: sessions with no clock-out yet; flagged once open longer than `maxHours`.
 * - `todaysSessions`: sessions clocked in today (store day); flagged when more than
 *   LATE_GRACE_MINUTES after `expectedStartTime` ('HH:MM') on that day.
 */
export function findAttendanceAlerts({
  openSessions,
  todaysSessions,
  now,
  timeZone,
  expectedStartTime,
  maxHours,
}: {
  openSessions: AlertSession[];
  todaysSessions: AlertSession[];
  now: Date;
  timeZone: string;
  expectedStartTime: string;
  maxHours: number;
}): AttendanceAlert[] {
  const alerts: AttendanceAlert[] = [];

  for (const session of openSessions) {
    const hours = (now.getTime() - new Date(session.clockIn).getTime()) / 3_600_000;
    if (hours > maxHours) {
      const u = who(session.userId);
      alerts.push({
        type: 'missing_clock_out',
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        attendanceId: String(session._id),
        clockInTime: session.clockIn,
        hoursSinceClockIn: hours.toFixed(2),
        message: `Employee has been clocked in for ${hours.toFixed(1)} hours without clocking out`,
      });
    }
  }

  const start = /^\d{2}:\d{2}$/.test(expectedStartTime) ? expectedStartTime : '09:00';
  for (const session of todaysSessions) {
    const clockIn = new Date(session.clockIn);
    const expected = tenantWallTimeToDate(`${toTenantDateString(clockIn, timeZone)}T${start}`, timeZone);
    const minutesLate = (clockIn.getTime() - expected.getTime()) / 60_000;
    if (minutesLate > LATE_GRACE_MINUTES) {
      const u = who(session.userId);
      alerts.push({
        type: 'late_arrival',
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        attendanceId: String(session._id),
        clockInTime: session.clockIn,
        expectedTime: expected,
        minutesLate: Math.round(minutesLate),
        message: `Employee arrived ${Math.round(minutesLate)} minutes late`,
      });
    }
  }

  return alerts;
}
