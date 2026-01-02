/**
 * Automatic Clock-Out for Forgotten Sessions
 * Auto-clock-out employees who forgot to clock out
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface AutoClockOutOptions {
  tenantId?: string;
  gracePeriodHours?: number; // Hours after shift end to auto-clock-out (default: 2)
}

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

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    const now = new Date();

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Check if attendance notifications are enabled
        if (!tenantSettings?.attendanceNotifications?.enabled) {
          continue;
        }

        // Find all open attendance sessions
        const openSessions = await Attendance.find({
          tenantId,
          clockOut: null,
        })
          .populate('userId', 'name email')
          .lean();

        for (const session of openSessions) {
          try {
            const clockInTime = new Date(session.clockIn);
            const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

            // Get expected shift end time (if configured)
            const expectedEndTime = tenantSettings?.attendanceNotifications?.expectedStartTime
              ? (() => {
                  // Simple logic: if expected start is 9 AM, assume 8-hour shift
                  const [hours, minutes] = tenantSettings.attendanceNotifications.expectedStartTime.split(':').map(Number);
                  const expectedStart = new Date(clockInTime);
                  expectedStart.setHours(hours, minutes || 0, 0, 0);
                  
                  // If clock-in was before expected start, use expected start
                  if (clockInTime < expectedStart) {
                    const expectedEnd = new Date(expectedStart);
                    expectedEnd.setHours(expectedEnd.getHours() + 8); // 8-hour shift
                    return expectedEnd;
                  } else {
                    // Use clock-in time + 8 hours
                    const expectedEnd = new Date(clockInTime);
                    expectedEnd.setHours(expectedEnd.getHours() + 8);
                    return expectedEnd;
                  }
                })()
              : null;

            // Determine if we should auto-clock-out
            let shouldAutoClockOut = false;
            let clockOutTime = now;

            if (expectedEndTime) {
              // Auto-clock-out if past expected end time + grace period
              const gracePeriodEnd = new Date(expectedEndTime.getTime() + gracePeriodHours * 60 * 60 * 1000);
              if (now > gracePeriodEnd) {
                shouldAutoClockOut = true;
                clockOutTime = expectedEndTime; // Use expected end time, not current time
              }
            } else {
              // If no expected end time, use max hours without clock-out
              const maxHours = tenantSettings?.attendanceNotifications?.maxHoursWithoutClockOut || 12;
              if (hoursSinceClockIn > maxHours) {
                shouldAutoClockOut = true;
                // Use clock-in + max hours as clock-out time
                clockOutTime = new Date(clockInTime.getTime() + maxHours * 60 * 60 * 1000);
              }
            }

            if (shouldAutoClockOut) {
              // Calculate total hours
              const totalMs = clockOutTime.getTime() - clockInTime.getTime();
              const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;

              // Update attendance record
              await Attendance.findByIdAndUpdate(session._id, {
                clockOut: clockOutTime,
                totalHours,
                notes: (session.notes || '') + (session.notes ? '\n' : '') + `[AUTO] Automatically clocked out after grace period.`,
              });

              totalProcessed++;

              // Send notification to employee and manager
              const user = session.userId as any;
              if (user?.email && tenantSettings?.emailNotifications) {
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';
                await sendEmail({
                  to: user.email,
                  subject: `Auto Clock-Out: ${user.name || 'Employee'}`,
                  message: `Hello ${user.name || 'Employee'},

Your attendance session has been automatically clocked out.

Clock-in: ${clockInTime.toLocaleString()}
Clock-out: ${clockOutTime.toLocaleString()}
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
Clock-in: ${clockInTime.toLocaleString()}
Clock-out: ${clockOutTime.toLocaleString()}
Total hours: ${totalHours} hours

Please review this attendance record.`,
                  type: 'email',
                }).catch(() => {
                  // Don't fail if email fails
                });
              }
            }
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Auto-clocked out ${totalProcessed} sessions${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error auto-clocking out sessions: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
