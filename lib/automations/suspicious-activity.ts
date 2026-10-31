/**
 * Suspicious Activity Detection
 * Detect and alert on suspicious patterns
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import CashDrawerSession from '@/models/CashDrawerSession';
import AuditLog from '@/models/AuditLog';
import Tenant from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { DEFAULT_TENANT_TIMEZONE, getTenantDayBoundaries } from '@/lib/timezone';
import { getAutomationTenants, type AutomationTenant } from './tenants';
import { formatTenantDate, tenantTimezone } from './local-time';
import { AutomationResult } from './types';

export interface SuspiciousActivityOptions {
  tenantId?: string;
  refundThreshold?: number; // Number of refunds to trigger alert (default: 5 per day)
  voidThreshold?: number; // Number of voids to trigger alert (default: 10 per day)
  discountThreshold?: number; // Discount amount to trigger alert (default: $100)
  failedLoginThreshold?: number; // Failed logins to trigger alert (default: 5)
}

/**
 * Detect suspicious activity patterns
 */
export async function detectSuspiciousActivity(
  options: SuspiciousActivityOptions = {}
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
    const refundThreshold = options.refundThreshold || 5;
    const voidThreshold = options.voidThreshold || 10;
    const discountThreshold = options.discountThreshold || 100;
    const failedLoginThreshold = options.failedLoginThreshold || 5;

    const now = new Date();
    // "Today" is the tenant's local calendar day. Most tenants use the default
    // timezone, so tenants already alerted since the default-zone midnight are
    // skipped in the query; tenants with another timezone are checked per tenant.
    const defaultTodayStart = getTenantDayBoundaries(now, DEFAULT_TENANT_TIMEZONE).start;

    // Get tenants to process. Alerts only go out by email, and at most once per
    // tenant per local day (runs hourly), so skip everyone else before querying.
    // Manual single-tenant runs bypass the filter and may re-alert.
    const tenants = (await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.emailNotifications': true,
        'settings.email': { $nin: [null, ''] },
        $or: [
          {
            'settings.timezone': { $in: [null, '', DEFAULT_TENANT_TIMEZONE] },
            suspiciousActivityAlertedAt: { $not: { $gte: defaultTodayStart } },
          },
          { 'settings.timezone': { $nin: [null, '', DEFAULT_TENANT_TIMEZONE] } },
        ],
      },
      select: 'name slug settings suspiciousActivityAlertedAt',
    })) as Array<AutomationTenant & { suspiciousActivityAlertedAt?: Date | null }>;

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalAlerts = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Nothing to do without somewhere to send the alert (manual runs bypass the filter)
        if (!tenantSettings?.emailNotifications || !tenantSettings?.email) {
          continue;
        }

        const tz = tenantTimezone(tenantSettings);
        const today = getTenantDayBoundaries(now, tz).start;

        // Already alerted during this local day (scheduled runs only; see above)
        if (
          !options.tenantId &&
          tenant.suspiciousActivityAlertedAt &&
          new Date(tenant.suspiciousActivityAlertedAt) >= today
        ) {
          continue;
        }

        const suspiciousActivities: string[] = [];

        const [txStats, failedLogins, drawersWithDiscrepancies] = await Promise.all([
          // Refunds, voids and large discounts in one pass over today's transactions.
          // Every refund creates a new 'refunded' transaction, so refunds made today
          // are counted by createdAt (keeps the scan on the tenantId+createdAt index).
          Transaction.aggregate<{ refunds: number; voids: number; largeDiscounts: number }>([
            { $match: { tenantId, createdAt: { $gte: today } } },
            {
              $group: {
                _id: null,
                refunds: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
                voids: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
                largeDiscounts: { $sum: { $cond: [{ $gte: ['$discountAmount', discountThreshold] }, 1, 0] } },
              },
            },
          ]),
          // Check for failed login attempts
          AuditLog.countDocuments({
            tenantId,
            action: 'LOGIN',
            'metadata.success': false,
            createdAt: { $gte: today },
          }),
          // Check for cash drawer discrepancies
          CashDrawerSession.countDocuments({
            tenantId,
            closingTime: { $gte: today },
            $or: [
              { shortage: { $gte: 50 } },
              { overage: { $gte: 100 } },
            ],
          }),
        ]);

        const { refunds: refundsToday = 0, voids: voidsToday = 0, largeDiscounts = 0 } = txStats[0] ?? {};

        // Check for excessive refunds
        if (refundsToday >= refundThreshold) {
          suspiciousActivities.push(`Excessive refunds: ${refundsToday} refunds today (threshold: ${refundThreshold})`);
        }

        // Check for excessive voids/cancellations
        if (voidsToday >= voidThreshold) {
          suspiciousActivities.push(`Excessive voids: ${voidsToday} cancelled transactions today (threshold: ${voidThreshold})`);
        }

        // Check for large discounts
        if (largeDiscounts > 0) {
          suspiciousActivities.push(`Large discounts detected: ${largeDiscounts} transactions with discounts >= $${discountThreshold}`);
        }

        if (failedLogins >= failedLoginThreshold) {
          suspiciousActivities.push(`Multiple failed login attempts: ${failedLogins} failed logins today (threshold: ${failedLoginThreshold})`);
        }

        if (drawersWithDiscrepancies > 0) {
          suspiciousActivities.push(`Cash drawer discrepancies: ${drawersWithDiscrepancies} drawers with significant shortages/overages`);
        }

        // Send alert if suspicious activities found
        if (suspiciousActivities.length > 0) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';
          
          const sent = await sendEmail({
            to: tenantSettings.email,
            subject: `🚨 Suspicious Activity Alert - ${companyName}`,
            message: `Suspicious Activity Detected for ${companyName}

Date: ${formatTenantDate(today, tz)}

The following suspicious activities were detected:

${suspiciousActivities.map(activity => `- ${activity}`).join('\n')}

Please review these activities immediately.

This is an automated security alert from your POS system.`,
            type: 'email',
          }).catch(() => false); // Don't fail if email fails

          // Mark the tenant as alerted today so later runs skip it (a failed send is
          // retried next run). timestamps: false keeps this a marker-only write, which
          // doesn't invalidate the tenant cache.
          if (sent) await Tenant.updateOne(
            { _id: tenantId },
            { $set: { suspiciousActivityAlertedAt: new Date() } },
            { timestamps: false }
          );

          totalAlerts++;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalAlerts;
    results.failed = totalFailed;
    results.message = `Detected ${totalAlerts} suspicious activity patterns${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error detecting suspicious activity: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
