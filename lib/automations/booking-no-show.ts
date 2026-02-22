/**
 * Automatic No-Show Detection and Follow-up
 * Detect no-shows and automatically update status and send follow-up
 */

import connectDB from '@/lib/mongodb';
import Booking from '@/models/Booking';
import Tenant from '@/models/Tenant';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { formatDate, formatTime } from '@/lib/formatting';
import { AutomationResult } from './types';

export interface NoShowDetectionOptions {
  tenantId?: string;
  gracePeriodMinutes?: number; // Minutes after start time to mark as no-show (default: 15)
}

/**
 * Automatically detect and handle no-shows
 */
export async function detectNoShows(
  options: NoShowDetectionOptions = {}
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
    const gracePeriodMinutes = options.gracePeriodMinutes || 15;
    const now = new Date();

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

    let totalNoShows = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Find bookings that:
        // 1. Are past start time + grace period
        // 2. Are still pending or confirmed (not completed/cancelled/no-show)
        const gracePeriodEnd = new Date(now.getTime() - gracePeriodMinutes * 60 * 1000);
        
        const potentialNoShows = await Booking.find({
          tenantId,
          startTime: { $lte: gracePeriodEnd },
          status: { $in: ['pending', 'confirmed'] },
        }).lean();

        for (const booking of potentialNoShows) {
          try {
            // Mark as no-show
            await Booking.findByIdAndUpdate(booking._id, {
              status: 'no-show',
            });

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
