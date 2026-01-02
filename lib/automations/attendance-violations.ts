/**
 * Attendance Violation Alerts
 * Alert managers for attendance issues (late arrivals, missing clock-ins)
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface AttendanceViolationOptions {
  tenantId?: string;
  lateThresholdMinutes?: number; // Minutes late to trigger alert (default: 15)
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalViolations = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

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
        const expectedStart = new Date(today);
        expectedStart.setHours(expectedHour, expectedMinute || 0, 0, 0);

        // Find attendance records for today
        const todayAttendance = await Attendance.find({
          tenantId,
          clockIn: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        })
          .populate('userId', 'name email')
          .lean();

        // Check for late arrivals
        for (const attendance of todayAttendance) {
          try {
            const clockInTime = new Date(attendance.clockIn);
            const minutesLate = (clockInTime.getTime() - expectedStart.getTime()) / (1000 * 60);

            if (minutesLate > lateThresholdMinutes) {
              const user = attendance.userId as any;
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
Expected Start Time: ${expectedStart.toLocaleTimeString()}
Actual Clock-In Time: ${clockInTime.toLocaleTimeString()}
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
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`Attendance ${attendance._id}: ${error.message}`);
          }
        }

        // Check for missing clock-ins (users who should have clocked in but haven't)
        // This would require a user schedule system, which may not exist
        // For now, we'll skip this check

      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalViolations;
    results.failed = totalFailed;
    results.message = `Detected ${totalViolations} attendance violations${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error detecting attendance violations: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
