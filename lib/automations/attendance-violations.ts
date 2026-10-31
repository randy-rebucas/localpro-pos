/**
 * Attendance Violation Alerts
 * Alert managers for attendance issues (late arrivals, missing clock-ins)
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import {
  addDaysToYmd,
  getTenantDayBoundaries,
  getTenantYmd,
  tenantLocalTimeToUtc,
} from '@/lib/timezone';
import { getAutomationTenants } from './tenants';
import { formatTenantTime, formatYmd, tenantTimezone } from './local-time';
import { AutomationResult } from './types';

export interface AttendanceViolationOptions {
  tenantId?: string;
  lateThresholdMinutes?: number; // Minutes late to trigger alert (default: 15)
  /** Local calendar day to review ('YYYY-MM-DD'); defaults to the tenant's previous day. */
  date?: string;
  /** Reference "now" (tests); defaults to the current time. */
  now?: Date;
}

/**
 * Detect and alert on attendance violations
 */
export async function detectAttendanceViolations(
  options: AttendanceViolationOptions = {}
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
    const lateThresholdMinutes = options.lateThresholdMinutes || 15;
    const now = options.now ?? new Date();

    // Get tenants to process. Alerts only go to the manager email, so tenants
    // without email notifications or an expected start time have nothing to do.
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.attendanceNotifications.enabled': { $ne: false },
        'settings.attendanceNotifications.expectedStartTime': { $nin: [null, ''] },
        'settings.emailNotifications': true,
        'settings.email': { $nin: [null, ''] },
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalViolations = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Manual single-tenant runs bypass the loader filter, so re-check here
        if (tenantSettings?.attendanceNotifications?.enabled === false) {
          continue;
        }
        if (!tenantSettings?.emailNotifications || !tenantSettings?.email) {
          continue;
        }

        // Get expected start time from tenant settings
        const expectedStartTime = tenantSettings?.attendanceNotifications?.expectedStartTime;
        if (!expectedStartTime) {
          continue; // Can't check violations without expected start time
        }

        // The job runs early morning (~06:00 tenant time) and reviews the previous
        // complete local day; `options.date` ('YYYY-MM-DD') overrides it.
        const tz = tenantTimezone(tenantSettings);
        const reviewYmd = options.date ?? addDaysToYmd(getTenantYmd(now, tz), -1);
        const { end: dayEnd } = getTenantDayBoundaries(reviewYmd, tz);
        const expectedStart = tenantLocalTimeToUtc(reviewYmd, expectedStartTime, tz);
        const lateCutoff = new Date(expectedStart.getTime() + lateThresholdMinutes * 60 * 1000);

        // Only that day's late arrivals (clock-in after the threshold) need loading
        if (lateCutoff > dayEnd) continue;
        const lateAttendance = await Attendance.find({
          tenantId,
          clockIn: {
            $gt: lateCutoff,
            $lte: dayEnd,
          },
        })
          .select('userId clockIn')
          .populate('userId', 'name email')
          .lean();

        const companyName = tenantSettings?.companyName || tenant.name || 'Business';

        // Alert on late arrivals
        for (const attendance of lateAttendance) {
          try {
            const clockInTime = new Date(attendance.clockIn);
            const minutesLate = (clockInTime.getTime() - expectedStart.getTime()) / (1000 * 60);

            const user = attendance.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!user) continue;

            // Send alert to manager
            await sendEmail({
              to: tenantSettings.email,
              subject: `Attendance Violation: Late Arrival - ${user.name || 'Employee'}`,
              message: `Attendance Violation Alert for ${companyName}

Employee: ${user.name || 'Unknown'}
Email: ${user.email || 'N/A'}
Date: ${formatYmd(reviewYmd)}
Expected Start Time: ${formatTenantTime(expectedStart, tz)}
Actual Clock-In Time: ${formatTenantTime(clockInTime, tz)}
Minutes Late: ${Math.round(minutesLate)}

Please review this attendance record.

This is an automated alert from your POS system.`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });

            totalViolations++;
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
