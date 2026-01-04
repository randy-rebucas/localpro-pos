/**
 * Automated Cash Count Reminders
 * Remind staff to count and close drawers at shift end
 */

import connectDB from '@/lib/mongodb';
import Attendance from '@/models/Attendance';
import CashDrawerSession from '@/models/CashDrawerSession';
import Tenant from '@/models/Tenant';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface CashCountReminderOptions {
  tenantId?: string;
  reminderMinutesBefore?: number; // Minutes before shift end to send reminder (default: 30)
}

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

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Find active attendance sessions (clocked in but not out)
        const activeSessions = await Attendance.find({
          tenantId,
          clockOut: null,
        })
          .populate('userId', 'name email')
          .lean();

        for (const session of activeSessions) {
          try {
            const user = session.userId as { _id?: string; name?: string; email?: string } | null;
            if (!user) continue;

            // Estimate shift end time (8 hours from clock-in, or use tenant settings)
            const clockInTime = new Date(session.clockIn);
            const estimatedShiftEnd = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000); // 8-hour shift default

            // Check if shift end is within reminder window
            if (estimatedShiftEnd >= reminderWindowStart && estimatedShiftEnd <= reminderWindowEnd) {
              // Check if user has an open cash drawer
              const openDrawer = await CashDrawerSession.findOne({
                tenantId,
                userId: user._id,
                status: 'open',
              }).lean();

              if (openDrawer) {
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';
                const reminderMessage = `Reminder: Your shift is ending soon. Please count and close your cash drawer before leaving.

Shift End: ${estimatedShiftEnd.toLocaleTimeString()}
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
                    message: `Reminder: Please count and close cash drawer before shift end at ${estimatedShiftEnd.toLocaleTimeString()}. - ${companyName}`,
                    type: 'sms',
                  }).catch(() => {
                    // Don't fail if SMS fails
                  });
                }

                totalReminders++;
              }
            }
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`Session ${session._id}: ${errorMessage}`);
          }
        }
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalReminders;
    results.failed = totalFailed;
    results.message = `Sent ${totalReminders} cash count reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error sending cash count reminders: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
