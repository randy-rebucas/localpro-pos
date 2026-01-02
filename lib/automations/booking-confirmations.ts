/**
 * Automatic Booking Confirmations
 * Auto-confirm bookings based on rules (e.g., no conflicts, payment received)
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Tenant from '@/models/Tenant';
import { sendBookingConfirmation } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface BookingConfirmationOptions {
  tenantId?: string;
  bookingId?: string; // For single booking confirmation
}

/**
 * Automatically confirm bookings based on rules
 */
export async function autoConfirmBookings(
  options: BookingConfirmationOptions = {}
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

    let totalConfirmed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Find pending bookings that can be auto-confirmed
        // Rules: no conflicts, within business hours (if configured), status is pending
        const pendingBookings = await Booking.find({
          tenantId,
          status: 'pending',
          confirmationSent: { $ne: true },
        }).lean();

        for (const booking of pendingBookings) {
          try {
            // Check for conflicts (bookings that overlap)
            const conflictingBookings = await Booking.find({
              tenantId,
              _id: { $ne: booking._id },
              status: { $in: ['pending', 'confirmed'] },
              $or: [
                {
                  startTime: { $lt: booking.endTime },
                  endTime: { $gt: booking.startTime },
                },
              ],
            }).lean();

            // If no conflicts, auto-confirm
            if (conflictingBookings.length === 0) {
              await Booking.findByIdAndUpdate(booking._id, {
                status: 'confirmed',
                confirmationSent: true,
              });

              // Send confirmation email/SMS
              await sendBookingConfirmation(
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

              totalConfirmed++;
            }
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

    results.processed = totalConfirmed;
    results.failed = totalFailed;
    results.message = `Auto-confirmed ${totalConfirmed} bookings${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error auto-confirming bookings: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
