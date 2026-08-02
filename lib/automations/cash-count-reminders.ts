/**
 * Automated Cash Count Reminders
 * Remind staff to count and close drawers at shift end
 */

import prisma from '@/lib/prisma';
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
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Find active attendance sessions (clocked in but not out)
        const activeSessions = await prisma.attendance.findMany({
          where: { tenantId, clockOut: null },
          include: { user: { select: { id: true, name: true, email: true } } },
        });

        for (const session of activeSessions) {
          try {
            const user = session.user;
            if (!user) continue;

            // Estimate shift end time (8 hours from clock-in, or use tenant settings)
            const clockInTime = new Date(session.clockIn);
            const estimatedShiftEnd = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000); // 8-hour shift default

            // Check if shift end is within reminder window
            if (estimatedShiftEnd >= reminderWindowStart && estimatedShiftEnd <= reminderWindowEnd) {
              // Check if user has an open cash drawer
              const openDrawer = await prisma.cashDrawerSession.findFirst({
                where: { tenantId, userId: user.id, status: 'open' },
              });

              if (openDrawer) {
                const companyName = tenantSettings?.companyName || tenant.name || 'Business';
                const reminderMessage = `Reminder: Your shift is ending soon. Please count and close your cash drawer before leaving.

Shift End: ${estimatedShiftEnd.toLocaleTimeString()}
Cash Drawer Session: ${openDrawer.id.slice(-8)}

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
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session.id}: ${error.message}`);
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
