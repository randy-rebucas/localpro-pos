/**
 * Suspicious Activity Detection
 * Detect and alert on suspicious patterns
 *
 * Dedupe (no schema changes): there is no record of alerts already sent, so
 * each run only alerts on what changed during its own window (default: the
 * last 60 minutes, matching the hourly `0 * * * *` schedule in vercel.json):
 *   - daily-count rules (refunds, voids, failed logins) alert only on the run
 *     in which the day's count *crossed* the threshold — once per tenant per day;
 *   - per-event rules (large discounts, drawer discrepancies) only count events
 *     that happened inside the window — each event is reported once.
 * If the job is scheduled more often than `windowMinutes`, pass a matching
 * `windowMinutes`, otherwise the same crossing can be reported more than once.
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { getRepos } from '@/lib/db';
import type { ITenantSettings } from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { getTenantDayBoundaries, DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone';
import { AutomationResult } from './types';

export interface SuspiciousActivityOptions {
  tenantId?: string;
  refundThreshold?: number; // Number of refunds to trigger alert (default: 5 per day)
  voidThreshold?: number; // Number of voids to trigger alert (default: 10 per day)
  discountThreshold?: number; // Discount amount to trigger alert (default: $100)
  failedLoginThreshold?: number; // Failed logins to trigger alert (default: 5)
  windowMinutes?: number; // Length of the run window / schedule interval (default: 60)
}

const TENANT_FIELDS = 'settings.emailNotifications settings.email settings.companyName settings.timezone';

interface TxCounts {
  refundsToday: number;
  refundsBeforeWindow: number;
  voidsToday: number;
  voidsBeforeWindow: number;
  largeDiscountsInWindow: number;
}

/** Threshold crossed during this window (count reached it now, but not before the window). */
const crossed = (today: number, beforeWindow: number, threshold: number) =>
  today >= threshold && beforeWindow < threshold;

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
    const windowMinutes = options.windowMinutes || 60;

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

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

    let totalAlerts = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;

        // Alerts are only ever emailed; skip the scans when they can't be delivered
        if (!tenantSettings?.emailNotifications || !tenantSettings?.email) {
          continue;
        }

        const tenantObjectId = new mongoose.Types.ObjectId(String(tenant._id));
        const timezone = tenantSettings.timezone || DEFAULT_TENANT_TIMEZONE;
        // "Today" is the tenant's local calendar day, not the server's (UTC)
        const today = getTenantDayBoundaries(now, timezone).start;

        const suspiciousActivities: string[] = [];

        // Refunds, voids and large discounts in ONE aggregate (was 3 queries)
        const inDay = (field: string) => ({ $gte: [field, today] });
        const beforeWindow = (field: string) => ({ $lt: [field, windowStart] });
        const countIf = (...conds: object[]) => ({ $sum: { $cond: [{ $and: conds }, 1, 0] } });
        const [tx] = await Transaction.aggregate<TxCounts>([
          {
            $match: {
              tenantId: tenantObjectId,
              $or: [
                { status: 'refunded', updatedAt: { $gte: today } },
                { status: 'cancelled', createdAt: { $gte: today } },
                { discountAmount: { $gte: discountThreshold }, createdAt: { $gte: windowStart } },
              ],
            },
          },
          {
            $group: {
              _id: null,
              refundsToday: countIf({ $eq: ['$status', 'refunded'] }, inDay('$updatedAt')),
              refundsBeforeWindow: countIf({ $eq: ['$status', 'refunded'] }, inDay('$updatedAt'), beforeWindow('$updatedAt')),
              voidsToday: countIf({ $eq: ['$status', 'cancelled'] }, inDay('$createdAt')),
              voidsBeforeWindow: countIf({ $eq: ['$status', 'cancelled'] }, inDay('$createdAt'), beforeWindow('$createdAt')),
              largeDiscountsInWindow: countIf(
                { $gte: ['$discountAmount', discountThreshold] },
                { $gte: ['$createdAt', windowStart] }
              ),
            },
          },
        ]);

        // Check for excessive refunds
        const refundsToday = tx?.refundsToday ?? 0;
        if (crossed(refundsToday, tx?.refundsBeforeWindow ?? 0, refundThreshold)) {
          suspiciousActivities.push(`Excessive refunds: ${refundsToday} refunds today (threshold: ${refundThreshold})`);
        }

        // Check for excessive voids/cancellations
        const voidsToday = tx?.voidsToday ?? 0;
        if (crossed(voidsToday, tx?.voidsBeforeWindow ?? 0, voidThreshold)) {
          suspiciousActivities.push(`Excessive voids: ${voidsToday} cancelled transactions today (threshold: ${voidThreshold})`);
        }

        // Check for large discounts (new ones since the previous run)
        const largeDiscounts = tx?.largeDiscountsInWindow ?? 0;
        if (largeDiscounts > 0) {
          suspiciousActivities.push(`Large discounts detected: ${largeDiscounts} transactions with discounts >= $${discountThreshold} in the last ${windowMinutes} minutes`);
        }

        // Check for failed login attempts (today and before-window counts in one read)
        const logins = await getRepos().auditLogs.failedLoginCounts(String(tenant._id), { since: today, windowStart });

        const failedLogins = logins.failedToday;
        if (crossed(failedLogins, logins.failedBeforeWindow, failedLoginThreshold)) {
          suspiciousActivities.push(`Multiple failed login attempts: ${failedLogins} failed logins today (threshold: ${failedLoginThreshold})`);
        }

        // Check for cash drawer discrepancies (drawers closed since the previous run)
        const drawersWithDiscrepancies = await getRepos().cashDrawerSessions.countDiscrepanciesSince(
          String(tenant._id),
          windowStart,
          { shortage: 50, overage: 100 }
        );

        if (drawersWithDiscrepancies > 0) {
          suspiciousActivities.push(`Cash drawer discrepancies: ${drawersWithDiscrepancies} drawers with significant shortages/overages`);
        }

        // Send alert if suspicious activities found
        if (suspiciousActivities.length > 0) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';

          await sendEmail({
            to: tenantSettings.email,
            subject: `🚨 Suspicious Activity Alert - ${companyName}`,
            message: `Suspicious Activity Detected for ${companyName}

Date: ${now.toLocaleDateString('en-US', { timeZone: timezone })}

The following suspicious activities were detected:

${suspiciousActivities.map(activity => `- ${activity}`).join('\n')}

Please review these activities immediately.

This is an automated security alert from your POS system.`,
            type: 'email',
          }).catch(() => {
            // Don't fail if email fails
          });

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
