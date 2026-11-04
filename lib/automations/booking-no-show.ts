/**
 * Automatic No-Show Detection and Follow-up
 * Detect no-shows and automatically update status and send follow-up
 */

import { getRepos } from '@/lib/db';
import type { ITenantSettings } from '@/models/Tenant';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { formatDate, formatTime } from '@/lib/formatting';
import { AutomationResult } from './types';

export interface NoShowDetectionOptions {
  tenantId?: string;
  gracePeriodMinutes?: number; // Minutes after start time to mark as no-show (default: 15)
  /**
   * Only bookings that started within this many hours are considered (default: 24).
   * Prevents the first run from mass-marking and emailing months of stale
   * pending/confirmed bookings that were never closed out by staff.
   */
  maxAgeHours?: number;
}

// formatDate/formatTime and the follow-up text need the full settings object.
const TENANT_FIELDS = 'settings';

/**
 * Automatically detect and handle no-shows
 */
export async function detectNoShows(
  options: NoShowDetectionOptions = {}
): Promise<AutomationResult> {
  const { bookings } = getRepos();

  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const gracePeriodMinutes = options.gracePeriodMinutes || 15;
    const maxAgeHours = options.maxAgeHours || 24;
    const now = new Date();

    // Get tenants to process
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: `_id slug name ${TENANT_FIELDS}` })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalNoShows = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;

        // Find bookings that:
        // 1. Are past start time + grace period (but not older than maxAgeHours)
        // 2. Are still pending or confirmed (not completed/cancelled/no-show)
        const gracePeriodEnd = new Date(now.getTime() - gracePeriodMinutes * 60 * 1000);
        const oldestStart = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);

        const potentialNoShows = await bookings.list(
          String(tenant._id),
          { startTime: { gte: oldestStart, lte: gracePeriodEnd }, status: ['pending', 'confirmed'] },
          { select: 'customerEmail customerPhone serviceName startTime staffName' }
        );

        if (potentialNoShows.length === 0) continue;

        // Mark all as no-show in one write. The status change is what makes the
        // follow-up at-most-once: next run no longer matches these bookings.
        await bookings.updateMany(
          String(tenant._id),
          { ids: potentialNoShows.map((b) => b._id), status: ['pending', 'confirmed'] },
          { status: 'no-show' }
        );

        for (const booking of potentialNoShows) {
          try {
            totalNoShows++;

            // Send follow-up email/SMS
            if (tenantSettings?.emailNotifications || tenantSettings?.smsNotifications) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business';
              const formattedDate = formatDate(booking.startTime, tenantSettings);
              const formattedTime = formatTime(booking.startTime, tenantSettings);

              const emailMessage = `We noticed you missed your appointment with ${companyName}.

Service: ${booking.serviceName}
Scheduled Date: ${formattedDate}
Scheduled Time: ${formattedTime}
${booking.staffName ? `Staff: ${booking.staffName}` : ''}

We understand that sometimes things come up. If you'd like to reschedule, please contact us and we'll be happy to help.

Thank you,
${companyName}`;

              const smsMessage = `We noticed you missed your appointment for ${booking.serviceName} on ${formattedDate} at ${formattedTime}. If you'd like to reschedule, please contact us. - ${companyName}`;

              // Send email
              if (booking.customerEmail && tenantSettings?.emailNotifications) {
                await sendEmail({
                  to: booking.customerEmail,
                  subject: `Missed Appointment - ${companyName}`,
                  message: emailMessage,
                  type: 'email',
                }).catch(() => {
                  // Don't fail if email fails
                });
              }

              // Send SMS
              if (booking.customerPhone && tenantSettings?.smsNotifications) {
                await sendSMS({
                  to: booking.customerPhone,
                  message: smsMessage,
                  type: 'sms',
                }).catch(() => {
                  // Don't fail if SMS fails
                });
              }
            }
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

    results.processed = totalNoShows;
    results.failed = totalFailed;
    results.message = `Detected ${totalNoShows} no-shows${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error detecting no-shows: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
