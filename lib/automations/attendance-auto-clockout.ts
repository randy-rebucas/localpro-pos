/**
 * Automatic Clock-Out for Forgotten Sessions
 * Auto-clock-out employees who forgot to clock out
 */

import type { AnyBulkWriteOperation } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Attendance, { type IAttendance } from '@/models/Attendance';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { AutomationResult } from './types';

export interface AutoClockOutOptions {
  tenantId?: string;
  gracePeriodHours?: number; // Hours after shift end to auto-clock-out (default: 2)
  // Only sessions clocked in within this many hours are auto-closed (default: 48).
  // Older forgotten sessions are left for a manager to fix — without this the
  // first run would close (and email about) every open session ever recorded.
  maxAgeHours?: number;
}

const TENANT_FIELDS =
  'settings.attendanceNotifications settings.emailNotifications settings.email settings.companyName settings.timezone';

interface PendingClockOut {
  user: { name?: string; email?: string } | null;
  clockInTime: Date;
  clockOutTime: Date;
  totalHours: number;
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
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants
      tenants = await getActiveTenants(TENANT_FIELDS);
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
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        const timezone = tenantSettings?.timezone || DEFAULT_TENANT_TIMEZONE;

        // Check if attendance notifications are enabled
        if (!tenantSettings?.attendanceNotifications?.enabled) {
          continue;
        }

        // Find all open attendance sessions
        const openSessions = await Attendance.find({
          tenantId: tenant._id,
          clockOut: null,
          clockIn: { $gte: new Date(Date.now() - (options.maxAgeHours ?? 48) * 60 * 60 * 1000) },
        })
          .select('userId clockIn notes')
          .populate('userId', 'name email')
          .lean();

        const ops: AnyBulkWriteOperation<IAttendance>[] = [];
        const pending: PendingClockOut[] = [];

        for (const session of openSessions) {
          try {
            const clockInTime = new Date(session.clockIn);
            const hoursSinceClockIn = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

            // Get expected shift end time (if configured)
            const expectedStartTime = tenantSettings?.attendanceNotifications?.expectedStartTime;
            const expectedEndTime = expectedStartTime
              ? (() => {
                  // Simple logic: if expected start is 9 AM, assume 8-hour shift.
                  // The expected start is read in the tenant's timezone on the
                  // clock-in's local calendar day (the server runs in UTC).
                  const [hours, minutes] = expectedStartTime.split(':').map(Number);
                  const dayStart = getTenantDayBoundaries(clockInTime, timezone).start;
                  const expectedStart = new Date(
                    dayStart.getTime() + ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000
                  );

                  // If clock-in was before expected start, use expected start; else clock-in
                  const base = clockInTime < expectedStart ? expectedStart : clockInTime;
                  return new Date(base.getTime() + 8 * 60 * 60 * 1000); // 8-hour shift
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

              // Each record gets its own computed values -> one bulkWrite per tenant.
              // `clockOut: null` in the filter keeps it idempotent if a user clocks
              // out between the read and the write.
              ops.push({
                updateOne: {
                  filter: { _id: session._id, tenantId: tenant._id, clockOut: null },
                  update: {
                    $set: {
                      clockOut: clockOutTime,
                      totalHours,
                      notes: (session.notes || '') + (session.notes ? '\n' : '') + `[AUTO] Automatically clocked out after grace period.`,
                    },
                  },
                },
              } as AnyBulkWriteOperation<IAttendance>);

              pending.push({
                user: session.userId as unknown as PendingClockOut['user'],
                clockInTime,
                clockOutTime,
                totalHours,
              });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }

        if (ops.length === 0) continue;

        // Update attendance records
        await Attendance.bulkWrite(ops, { ordered: false });
        totalProcessed += pending.length;

        // Send notification to employee and manager
        const companyName = tenantSettings?.companyName || tenant.name || 'Business';
        const fmt = (d: Date) => d.toLocaleString('en-US', { timeZone: timezone });
        for (const { user, clockInTime, clockOutTime, totalHours } of pending) {
          if (user?.email && tenantSettings?.emailNotifications) {
            await sendEmail({
              to: user.email,
              subject: `Auto Clock-Out: ${user.name || 'Employee'}`,
              message: `Hello ${user.name || 'Employee'},

Your attendance session has been automatically clocked out.

Clock-in: ${fmt(clockInTime)}
Clock-out: ${fmt(clockOutTime)}
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
Clock-in: ${fmt(clockInTime)}
Clock-out: ${fmt(clockOutTime)}
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
