/**
 * Automated Booking Reminders
 * Sends reminders for upcoming bookings
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { sendBookingReminder } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

export interface BookingReminderOptions {
  tenantId?: string;
  hoursBefore?: number;
}

/**
 * Send booking reminders for all tenants or a specific tenant
 */
export async function sendBookingReminders(
  options: BookingReminderOptions = {}
): Promise<AutomationResult> {
  await connectDB();

  const { tenantId, hoursBefore = 24 } = options;
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get tenants to process: booking scheduling on and at least one notification channel enabled
    const tenants = await getAutomationTenants({
      tenantId,
      filter: {
        'settings.enableBookingScheduling': true,
        $or: [{ 'settings.emailNotifications': true }, { 'settings.smsNotifications': true }],
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        // Check if booking reminders are enabled for this tenant (manual single-tenant runs skip the filter)
        const tenantSettings = tenant.settings;
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue; // Skip if notifications disabled
        }

        // Calculate the time window for bookings that need reminders
        const now = new Date();
        const reminderWindowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const reminderWindowEnd = new Date(reminderWindowStart.getTime() + 60 * 60 * 1000); // 1 hour window

        // Find bookings that need reminders
        const bookingsToRemind = await Booking.find({
          tenantId: tenant._id,
          startTime: {
            $gte: reminderWindowStart,
            $lte: reminderWindowEnd,
          },
          status: { $in: ['pending', 'confirmed'] },
          reminderSent: { $ne: true },
        })
          .select('customerName customerEmail customerPhone serviceName startTime endTime staffName notes')
          .lean();

        const remindedIds: typeof bookingsToRemind[number]['_id'][] = [];

        // Send reminders for each booking
        for (const booking of bookingsToRemind) {
          try {
            await sendBookingReminder(
              {
                customerName: booking.customerName,
                customerEmail: booking.customerEmail,
                customerPhone: booking.customerPhone,
                serviceName: booking.serviceName,
                startTime: booking.startTime,
                endTime: booking.endTime,
                staffName: booking.staffName,
                notes: booking.notes,
                bookingId: booking._id.toString(),
              },
              tenantSettings || undefined
            );

            remindedIds.push(booking._id);
            totalProcessed++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Booking ${booking._id}: ${error.message}`);
          }
        }

        // Mark reminders as sent in one write
        if (remindedIds.length > 0) {
          await Booking.updateMany(
            { tenantId: tenant._id, _id: { $in: remindedIds } },
            { $set: { reminderSent: true } }
          );
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Processed ${totalProcessed} booking reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending booking reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
