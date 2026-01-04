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
import { getTenantSettingsById } from '@/lib/tenant';
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    let totalAlerts = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        const suspiciousActivities: string[] = [];

        // Check for excessive refunds
        const refundsToday = await Transaction.countDocuments({
          tenantId,
          status: 'refunded',
          updatedAt: { $gte: today },
        });

        if (refundsToday >= refundThreshold) {
          suspiciousActivities.push(`Excessive refunds: ${refundsToday} refunds today (threshold: ${refundThreshold})`);
        }

        // Check for excessive voids/cancellations
        const voidsToday = await Transaction.countDocuments({
          tenantId,
          status: 'cancelled',
          createdAt: { $gte: today },
        });

        if (voidsToday >= voidThreshold) {
          suspiciousActivities.push(`Excessive voids: ${voidsToday} cancelled transactions today (threshold: ${voidThreshold})`);
        }

        // Check for large discounts
        const largeDiscounts = await Transaction.find({
          tenantId,
          discountAmount: { $gte: discountThreshold },
          createdAt: { $gte: today },
        }).lean();

        if (largeDiscounts.length > 0) {
          suspiciousActivities.push(`Large discounts detected: ${largeDiscounts.length} transactions with discounts >= $${discountThreshold}`);
        }

        // Check for failed login attempts
        const failedLogins = await AuditLog.countDocuments({
          tenantId,
          action: 'LOGIN',
          'metadata.success': false,
          createdAt: { $gte: today },
        });

        if (failedLogins >= failedLoginThreshold) {
          suspiciousActivities.push(`Multiple failed login attempts: ${failedLogins} failed logins today (threshold: ${failedLoginThreshold})`);
        }

        // Check for cash drawer discrepancies
        const drawersWithDiscrepancies = await CashDrawerSession.find({
          tenantId,
          closingTime: { $gte: today },
          $or: [
            { shortage: { $gte: 50 } },
            { overage: { $gte: 100 } },
          ],
        }).lean();

        if (drawersWithDiscrepancies.length > 0) {
          suspiciousActivities.push(`Cash drawer discrepancies: ${drawersWithDiscrepancies.length} drawers with significant shortages/overages`);
        }

        // Send alert if suspicious activities found
        if (suspiciousActivities.length > 0 && tenantSettings?.emailNotifications && tenantSettings?.email) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';
          
          await sendEmail({
            to: tenantSettings.email,
            subject: `🚨 Suspicious Activity Alert - ${companyName}`,
            message: `Suspicious Activity Detected for ${companyName}

Date: ${today.toLocaleDateString()}

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
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalAlerts;
    results.failed = totalFailed;
    results.message = `Detected ${totalAlerts} suspicious activity patterns${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error detecting suspicious activity: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
