/**
 * Automatic Booking Confirmations
 * Auto-confirm bookings based on rules (e.g., no conflicts, payment received)
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';
import { sendBookingConfirmation } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface BookingConfirmationOptions {
  tenantId?: string;
  bookingId?: string; // For single booking confirmation
}

const TENANT_FIELDS = 'settings';

/**
 * Automatically confirm bookings based on rules
 *
 * Only *upcoming* pending bookings are candidates (past ones are handled by
 * no-show detection). All pending/confirmed bookings that end in the future
 * are loaded once per tenant and the overlap check is done in memory, so the
 * cost is one read query per tenant no matter how many bookings are pending
 * or how many runs a conflicting booking stays pending for.
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

    let totalConfirmed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        const now = new Date();

        // Every pending/confirmed booking that has not ended yet. Any booking
        // overlapping an upcoming candidate necessarily ends after now, so this
        // single result set contains both the candidates and their conflicts.
        const scheduleFilter: Record<string, unknown> = {
          tenantId: tenant._id,
          status: { $in: ['pending', 'confirmed'] },
          endTime: { $gt: now },
        };
        const schedule = await Booking.find(scheduleFilter)
          .select('status confirmationSent startTime endTime customerName customerEmail customerPhone serviceName staffName notes')
          .sort({ startTime: 1 })
          .lean();

        // Rules: no conflicts, status is pending, confirmation not yet sent, starts in the future
        const candidates = schedule.filter((b) =>
          b.status === 'pending' &&
          b.confirmationSent !== true &&
          new Date(b.startTime) >= now &&
          (!options.bookingId || b._id.toString() === options.bookingId)
        );
        if (candidates.length === 0) continue;

        const toConfirm = candidates.filter((booking) => {
          const start = new Date(booking.startTime).getTime();
          const end = new Date(booking.endTime).getTime();
          // Same rule as before: any other pending/confirmed booking in the tenant overlapping this one
          return !schedule.some((other) =>
            other._id.toString() !== booking._id.toString() &&
            new Date(other.startTime).getTime() < end &&
            new Date(other.endTime).getTime() > start
          );
        });
        if (toConfirm.length === 0) continue;

        // One write for all confirmations; the status guard keeps it idempotent
        await Booking.updateMany(
          {
            tenantId: tenant._id,
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
              tenantSettings || undefined
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
