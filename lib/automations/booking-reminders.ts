/**
 * Automated Booking Reminders
 * Sends reminders for upcoming bookings
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Tenant from '@/models/Tenant';
import { sendBookingReminder } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
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
    // Get tenants to process
    let tenants;
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId).lean();
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

    for (const tenant of tenants) {
      try {
        // Check if booking reminders are enabled for this tenant
        const tenantSettings = await getTenantSettingsById(tenant._id.toString());
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
        }).lean();

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

            // Mark reminder as sent
            await Booking.findByIdAndUpdate(booking._id, { reminderSent: true });
            totalProcessed++;
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`Booking ${booking._id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Processed ${totalProcessed} booking reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error sending booking reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
