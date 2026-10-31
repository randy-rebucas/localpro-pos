/**
 * Automated Cash Count Reminders
 * Remind staff to count and close drawers at shift end
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import CashDrawerSession from '@/models/CashDrawerSession';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
import { formatTenantTime, tenantTimezone } from './local-time';
import { AutomationResult } from './types';

export interface CashCountReminderOptions {
  tenantId?: string;
  reminderMinutesBefore?: number; // Minutes before shift end to send reminder (default: 30)
}

const SHIFT_MS = 8 * 60 * 60 * 1000; // 8-hour shift default

/**
 * Send reminders to staff to count and close cash drawers before shift end
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

    // Get tenants to process (skip tenants with all notifications disabled)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        $or: [{ 'settings.emailNotifications': true }, { 'settings.smsNotifications': true }],
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;
        const tz = tenantTimezone(tenantSettings);

        // Manual single-tenant runs bypass the loader filter, so re-check here
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Find active attendance sessions (clocked in but not out) whose estimated
        // shift end (clock-in + 8h) falls within the reminder window
        const activeSessions = await Attendance.find({
          tenantId,
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

        // Open cash drawers for these users, in one query
        const userIds = activeSessions
          .map(s => (s.userId as any)?._id) // eslint-disable-line @typescript-eslint/no-explicit-any
          .filter(Boolean);
        const openDrawers = await CashDrawerSession.find({
          tenantId,
          status: 'open',
          userId: { $in: userIds },
        })
          .select('_id userId')
          .lean();
        const openDrawerByUser = new Map(openDrawers.map(d => [d.userId.toString(), d]));

        for (const session of activeSessions) {
          try {
            const user = session.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!user) continue;

            // Estimate shift end time (8 hours from clock-in, or use tenant settings)
            const clockInTime = new Date(session.clockIn);
            const estimatedShiftEnd = new Date(clockInTime.getTime() + SHIFT_MS);

            // Check if user has an open cash drawer
            const openDrawer = openDrawerByUser.get(user._id.toString());

            if (openDrawer) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business';
              const reminderMessage = `Reminder: Your shift is ending soon. Please count and close your cash drawer before leaving.

Shift End: ${formatTenantTime(estimatedShiftEnd, tz)}
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
                  message: `Reminder: Please count and close cash drawer before shift end at ${formatTenantTime(estimatedShiftEnd, tz)}. - ${companyName}`,
                  type: 'sms',
                }).catch(() => {
                  // Don't fail if SMS fails
                });
              }

              totalReminders++;
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
