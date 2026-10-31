/**
 * Automatic Clock-Out for Forgotten Sessions
 * Auto-clock-out employees who forgot to clock out
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import { getTenantYmd, tenantLocalTimeToUtc } from '@/lib/timezone';
import { getAutomationTenants } from './tenants';
import { formatTenantDateTime, tenantTimezone } from './local-time';
import { AutomationResult } from './types';

export interface AutoClockOutOptions {
  tenantId?: string;
  gracePeriodHours?: number; // Hours after shift end to auto-clock-out (default: 2)
}

const HOUR_MS = 60 * 60 * 1000;
const SHIFT_HOURS = 8;

/**
 * Automatically clock out employees who forgot to clock out
 */
export async function autoClockOutForgottenSessions(
  options: AutoClockOutOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const gracePeriodHours = options.gracePeriodHours || 2;

    // Get tenants to process (attendance notifications default to enabled)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: { 'settings.attendanceNotifications.enabled': { $ne: false } },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    const now = new Date();

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Manual single-tenant runs bypass the loader filter, so re-check here
        if (tenantSettings?.attendanceNotifications?.enabled === false) {
          continue;
        }

        const expectedStartTime = tenantSettings?.attendanceNotifications?.expectedStartTime;
        const maxHours = tenantSettings?.attendanceNotifications?.maxHoursWithoutClockOut || 12;
        const tz = tenantTimezone(tenantSettings);

        // A session can only qualify once it is older than the shortest possible
        // cutoff (expected end is always >= clock-in + 8h), so skip younger ones in the query.
        const minAgeHours = expectedStartTime ? 8 + gracePeriodHours : maxHours;

        // Find open attendance sessions old enough to be auto-clocked out
        const openSessions = await Attendance.find({
          tenantId,
          clockOut: null,
          clockIn: { $lt: new Date(now.getTime() - minAgeHours * HOUR_MS) },
        })
          .select('userId clockIn notes')
          .populate('userId', 'name email')
          .lean();

        const toClockOut: {
          session: (typeof openSessions)[number];
          clockInTime: Date;
          clockOutTime: Date;
          totalHours: number;
        }[] = [];

        for (const session of openSessions) {
          try {
            const clockInTime = new Date(session.clockIn);
            const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / HOUR_MS;

            // Get expected shift end time (if configured)
            const expectedEndTime = expectedStartTime
              ? (() => {
                  // Simple logic: if expected start is 9 AM, assume 8-hour shift.
                  // Expected start is that wall-clock time on the clock-in's local day.
                  const expectedStart = tenantLocalTimeToUtc(
                    getTenantYmd(clockInTime, tz),
                    expectedStartTime,
                    tz
                  );

                  // If clock-in was before expected start, use expected start; otherwise clock-in
                  const shiftStart = clockInTime < expectedStart ? expectedStart : clockInTime;
                  return new Date(shiftStart.getTime() + SHIFT_HOURS * HOUR_MS);
                })()
              : null;

            // Determine if we should auto-clock-out
            let shouldAutoClockOut = false;
            let clockOutTime = now;

            if (expectedEndTime) {
              // Auto-clock-out if past expected end time + grace period
              const gracePeriodEnd = new Date(expectedEndTime.getTime() + gracePeriodHours * HOUR_MS);
              if (now > gracePeriodEnd) {
                shouldAutoClockOut = true;
                clockOutTime = expectedEndTime; // Use expected end time, not current time
              }
            } else if (hoursSinceClockIn > maxHours) {
              // If no expected end time, use max hours without clock-out
              shouldAutoClockOut = true;
              // Use clock-in + max hours as clock-out time
              clockOutTime = new Date(clockInTime.getTime() + maxHours * HOUR_MS);
            }

            if (shouldAutoClockOut) {
              // Calculate total hours
              const totalMs = clockOutTime.getTime() - clockInTime.getTime();
              const totalHours = Math.round((totalMs / HOUR_MS) * 100) / 100;
              toClockOut.push({ session, clockInTime, clockOutTime, totalHours });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }

        if (toClockOut.length === 0) continue;

        // Update all attendance records in one round trip. clockOut: null guards
        // against a manual clock-out that happened since the read.
        const writeResult = await Attendance.bulkWrite(
          toClockOut.map(({ session, clockOutTime, totalHours }) => ({
            updateOne: {
              filter: { tenantId, _id: session._id, clockOut: null },
              update: {
                $set: {
                  clockOut: clockOutTime,
                  totalHours,
                  notes: (session.notes || '') + (session.notes ? '\n' : '') + `[AUTO] Automatically clocked out after grace period.`,
                },
              },
            },
          })),
          { ordered: false }
        );
        totalProcessed += writeResult.modifiedCount;

        const companyName = tenantSettings?.companyName || tenant.name || 'Business';

        // Send notification to employee and manager
        for (const { session, clockInTime, clockOutTime, totalHours } of toClockOut) {
          const user = session.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          if (user?.email && tenantSettings?.emailNotifications) {
            await sendEmail({
              to: user.email,
              subject: `Auto Clock-Out: ${user.name || 'Employee'}`,
              message: `Hello ${user.name || 'Employee'},

Your attendance session has been automatically clocked out.

Clock-in: ${formatTenantDateTime(clockInTime, tz)}
Clock-out: ${formatTenantDateTime(clockOutTime, tz)}
Total hours: ${totalHours} hours

This occurred because you did not manually clock out within the grace period. If this is incorrect, please contact your manager.

Best regards,
${companyName} Attendance System`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }

          // Also notify manager/admin
          if (tenantSettings?.email && tenantSettings?.email !== user?.email) {
            await sendEmail({
              to: tenantSettings.email,
              subject: `Auto Clock-Out Alert: ${user?.name || 'Employee'}`,
              message: `An employee has been automatically clocked out:

Employee: ${user?.name || 'Unknown'}
Email: ${user?.email || 'N/A'}
Clock-in: ${formatTenantDateTime(clockInTime, tz)}
Clock-out: ${formatTenantDateTime(clockOutTime, tz)}
Total hours: ${totalHours} hours

Please review this attendance record.`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Auto-clocked out ${totalProcessed} sessions${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error auto-clocking out sessions: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
