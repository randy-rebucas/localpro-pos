/**
 * Automatic Booking Confirmations
 * Auto-confirm bookings based on rules (e.g., no conflicts, payment received)
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import { sendBookingConfirmation } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
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
    // Get tenants to process (only those with booking scheduling enabled)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: { 'settings.enableBookingScheduling': true },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalConfirmed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;

        // Find pending bookings that can be auto-confirmed
        // Rules: no conflicts, within business hours (if configured), status is pending
        const pendingBookings = await Booking.find({
          tenantId,
          status: 'pending',
          confirmationSent: { $ne: true },
          ...(options.bookingId ? { _id: options.bookingId } : {}),
        })
          .select('customerName customerEmail customerPhone serviceName startTime endTime staffName notes')
          .lean();

        if (pendingBookings.length === 0) continue;

        // Load every active booking overlapping the pending bookings' overall time
        // window once, then check conflicts in memory. Bookings confirmed earlier in
        // this run stay in the set (pending -> confirmed are both "active").
        let windowStart = pendingBookings[0].startTime;
        let windowEnd = pendingBookings[0].endTime;
        for (const booking of pendingBookings) {
          if (booking.startTime < windowStart) windowStart = booking.startTime;
          if (booking.endTime > windowEnd) windowEnd = booking.endTime;
        }

        const activeBookings = await Booking.find({
          tenantId,
          status: { $in: ['pending', 'confirmed'] },
          startTime: { $lt: windowEnd },
          endTime: { $gt: windowStart },
        })
          .select('_id startTime endTime status')
          .lean();

        // If no conflicts, auto-confirm
        const toConfirm = pendingBookings.filter((booking) => {
          const id = booking._id.toString();
          return !activeBookings.some(
            (other) =>
              other._id.toString() !== id &&
              other.startTime < booking.endTime &&
              other.endTime > booking.startTime
          );
        });

        if (toConfirm.length === 0) continue;

        await Booking.updateMany(
          {
            tenantId,
            _id: { $in: toConfirm.map((b) => b._id) },
            status: 'pending',
          },
          { $set: { status: 'confirmed', confirmationSent: true } }
        );

        for (const booking of toConfirm) {
          try {
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
              tenant.settings || undefined
            );

            totalConfirmed++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Booking ${booking._id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalConfirmed;
    results.failed = totalFailed;
    results.message = `Auto-confirmed ${totalConfirmed} bookings${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error auto-confirming bookings: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
