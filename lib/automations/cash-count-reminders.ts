/**
 * Automated Cash Count Reminders
 * Remind staff to count and close drawers at shift end
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import CashDrawerSession from '@/models/CashDrawerSession';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface CashCountReminderOptions {
  tenantId?: string;
  reminderMinutesBefore?: number; // Minutes before shift end to send reminder (default: 30)
}

const TENANT_FIELDS =
  'settings.emailNotifications settings.smsNotifications settings.companyName settings.phone settings.timezone';

const SHIFT_MS = 8 * 60 * 60 * 1000; // 8-hour shift default

/**
 * Send reminders to staff to count and close cash drawers before shift end
 *
 * A session is reminded only by the run whose 1-hour window contains its
 * estimated shift end, so each session gets at most one reminder as long as
 * runs are at least an hour apart.
 */
export async function sendCashCountReminders(
  options: CashCountReminderOptions = {}
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
    const reminderMinutesBefore = options.reminderMinutesBefore || 30;
    const now = new Date();
    const reminderWindowStart = new Date(now.getTime() + reminderMinutesBefore * 60 * 1000);
    const reminderWindowEnd = new Date(reminderWindowStart.getTime() + 60 * 60 * 1000); // 1 hour window

    // Get tenants to process
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Active attendance sessions (clocked in but not out) whose estimated
        // shift end (clock-in + 8h) falls inside the reminder window — the
        // window is pushed into the query instead of filtering in memory.
        const activeSessions = await Attendance.find({
          tenantId: tenant._id,
          clockOut: null,
          clockIn: {
            $gte: new Date(reminderWindowStart.getTime() - SHIFT_MS),
            $lte: new Date(reminderWindowEnd.getTime() - SHIFT_MS),
          },
        })
          .select('userId clockIn')
          .populate('userId', 'name email')
          .lean();

        if (activeSessions.length === 0) continue;

        // Open drawers for all these users in one query (was one findOne per session)
        const userIds = activeSessions
          .map((s) => (s.userId as unknown as { _id?: unknown } | null)?._id)
          .filter(Boolean);
        const openDrawers = userIds.length
          ? await CashDrawerSession.find({
              tenantId: tenant._id,
              userId: { $in: userIds },
              status: 'open',
            })
              .select('userId')
              .lean()
          : [];
        const drawerByUser = new Map(openDrawers.map((d) => [d.userId.toString(), d]));

        const timezone = tenantSettings?.timezone || undefined;

        for (const session of activeSessions) {
          try {
            const user = session.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!user) continue;

            // Estimate shift end time (8 hours from clock-in)
            const clockInTime = new Date(session.clockIn);
            const estimatedShiftEnd = new Date(clockInTime.getTime() + SHIFT_MS);

            // Check if shift end is within reminder window
            if (estimatedShiftEnd >= reminderWindowStart && estimatedShiftEnd <= reminderWindowEnd) {
              // Check if user has an open cash drawer
              const openDrawer = drawerByUser.get(user._id.toString());

              if (openDrawer) {
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';
                const shiftEndLabel = estimatedShiftEnd.toLocaleTimeString('en-US', { timeZone: timezone });
                const reminderMessage = `Reminder: Your shift is ending soon. Please count and close your cash drawer before leaving.

Shift End: ${shiftEndLabel}
Cash Drawer Session: ${openDrawer._id.toString().slice(-8)}

Thank you,
${companyName}`;

                // Send email reminder
                if (user.email && tenantSettings?.emailNotifications) {
                  await sendEmail({
                    to: user.email,
                    subject: `Cash Drawer Count Reminder - ${companyName}`,
                    message: reminderMessage,
                    type: 'email',
                  }).catch(() => {
                    // Don't fail if email fails
                  });
                }

                // Send SMS reminder
                if (tenantSettings?.phone && tenantSettings?.smsNotifications) {
                  await sendSMS({
                    to: tenantSettings.phone,
                    message: `Reminder: Please count and close cash drawer before shift end at ${shiftEndLabel}. - ${companyName}`,
                    type: 'sms',
                  }).catch(() => {
                    // Don't fail if SMS fails
                  });
                }

                totalReminders++;
              }
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalReminders;
    results.failed = totalFailed;
    results.message = `Sent ${totalReminders} cash count reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending cash count reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
