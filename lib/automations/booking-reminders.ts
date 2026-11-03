/**
 * Automated Booking Reminders
 * Sends reminders for upcoming bookings
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';
import { sendBookingReminder } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface BookingReminderOptions {
  tenantId?: string;
  hoursBefore?: number;
}

// Notification helpers read many settings (company name, formats, timezone…).
const TENANT_FIELDS = 'settings';

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
    let tenants: ActiveTenant[];
    if (tenantId) {
      const tenant = await Tenant.findById(tenantId)
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

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        // Check if booking reminders are enabled for this tenant
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue; // Skip if notifications disabled
        }

        // Calculate the time window for bookings that need reminders
        const now = new Date();
        const reminderWindowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const reminderWindowEnd = new Date(reminderWindowStart.getTime() + 60 * 60 * 1000); // 1 hour window

        // Find bookings that need reminders (reminderSent guarantees at-most-once)
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

        const remindedIds: unknown[] = [];

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

        // Mark all sent reminders in one write
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
