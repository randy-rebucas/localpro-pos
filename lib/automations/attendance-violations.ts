/**
 * Attendance Violation Alerts
 * Alert managers for attendance issues (late arrivals, missing clock-ins)
 */

import { getRepos } from '@/lib/db';
import { sendEmail } from '@/lib/notifications';
import type { ITenantSettings } from '@/models/Tenant';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { AutomationResult } from './types';

export interface AttendanceViolationOptions {
  tenantId?: string;
  lateThresholdMinutes?: number; // Minutes late to trigger alert (default: 15)
  /**
   * Look-back window for clock-ins, in hours (default: 24, matching the daily
   * `0 9 * * *` schedule in vercel.json). Attendance has no "alert sent" flag,
   * so each clock-in is only examined by the one daily run whose window
   * contains it — at most one alert per late arrival.
   */
  windowHours?: number;
}

const TENANT_FIELDS =
  'settings.attendanceNotifications settings.emailNotifications settings.email settings.companyName settings.timezone';

/**
 * Detect and alert on attendance violations
 */
export async function detectAttendanceViolations(
  options: AttendanceViolationOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const lateThresholdMinutes = options.lateThresholdMinutes || 15;
    const windowHours = options.windowHours || 24;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    // Get tenants to process
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: `_id slug name ${TENANT_FIELDS}` })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalViolations = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        const timezone = tenantSettings?.timezone || DEFAULT_TENANT_TIMEZONE;

        // Skip if attendance notifications disabled
        if (!tenantSettings?.attendanceNotifications?.enabled) {
          continue;
        }

        // Get expected start time from tenant settings
        const expectedStartTime = tenantSettings?.attendanceNotifications?.expectedStartTime;
        if (!expectedStartTime) {
          continue; // Can't check violations without expected start time
        }

        const [expectedHour, expectedMinute] = expectedStartTime.split(':').map(Number);
        const expectedOffsetMs = ((expectedHour || 0) * 60 + (expectedMinute || 0)) * 60 * 1000;
        // Expected start on the clock-in's calendar day, in the tenant's timezone
        const expectedStartFor = (clockIn: Date) =>
          new Date(getTenantDayBoundaries(clockIn, timezone).start.getTime() + expectedOffsetMs);
        const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: timezone });

        // Find attendance records clocked in during this run's window
        const todayAttendance = await getRepos().attendance.list(
          String(tenant._id),
          { clockIn: { gte: windowStart, lt: now } },
          { select: 'userId clockIn', populateUser: true }
        );

        // Check for late arrivals
        for (const attendance of todayAttendance) {
          try {
            const clockInTime = new Date(attendance.clockIn);
            const expectedStart = expectedStartFor(clockInTime);
            const minutesLate = (clockInTime.getTime() - expectedStart.getTime()) / (1000 * 60);

            if (minutesLate > lateThresholdMinutes) {
              const user = attendance.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
              if (!user) continue;

              // Send alert to manager
              if (tenantSettings?.emailNotifications && tenantSettings?.email) {
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';
                
                await sendEmail({
                  to: tenantSettings.email,
                  subject: `Attendance Violation: Late Arrival - ${user.name || 'Employee'}`,
                  message: `Attendance Violation Alert for ${companyName}

Employee: ${user.name || 'Unknown'}
Email: ${user.email || 'N/A'}
Expected Start Time: ${fmtTime(expectedStart)}
Actual Clock-In Time: ${fmtTime(clockInTime)}
Minutes Late: ${Math.round(minutesLate)}

Please review this attendance record.

This is an automated alert from your POS system.`,
                  type: 'email',
                }).catch(() => {
                  // Don't fail if email fails
                });

                totalViolations++;
              }
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Attendance ${attendance._id}: ${error.message}`);
          }
        }

        // Check for missing clock-ins (users who should have clocked in but haven't)
        // This would require a user schedule system, which may not exist
        // For now, we'll skip this check

      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalViolations;
    results.failed = totalFailed;
    results.message = `Detected ${totalViolations} attendance violations${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error detecting attendance violations: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
