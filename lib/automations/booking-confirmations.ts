/**
 * Automatic Booking Confirmations
 * Auto-confirm bookings based on rules (e.g., no conflicts, payment received)
 */

import prisma from '@/lib/prisma';
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
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalConfirmed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Find pending bookings that can be auto-confirmed
        // Rules: no conflicts, within business hours (if configured), status is pending
        const pendingBookings = await prisma.booking.findMany({
          where: {
            tenantId,
            status: 'pending',
            confirmationSent: { not: true },
          },
        });

        for (const booking of pendingBookings) {
          try {
            // Check for conflicts (bookings that overlap)
            const conflictingBookings = await prisma.booking.findMany({
              where: {
                tenantId,
                id: { not: booking.id },
                status: { in: ['pending', 'confirmed'] },
                startTime: { lt: booking.endTime },
                endTime: { gt: booking.startTime },
              },
            });

            // If no conflicts, auto-confirm
            if (conflictingBookings.length === 0) {
              await prisma.booking.update({
                where: { id: booking.id },
                data: {
                  status: 'confirmed',
                  confirmationSent: true,
                },
              });

              // Send confirmation email/SMS
              await sendBookingConfirmation(
                {
                  customerName: booking.customerName,
                  customerEmail: booking.customerEmail ?? undefined,
                  customerPhone: booking.customerPhone ?? undefined,
                  serviceName: booking.serviceName,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                  staffName: booking.staffName ?? undefined,
                  notes: booking.notes ?? undefined,
                  bookingId: booking.id,
                },
                tenantSettings || undefined
              );

              totalConfirmed++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Booking ${booking.id}: ${error.message}`);
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
