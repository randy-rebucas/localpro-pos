/**
 * Suspicious Activity Detection
 * Detect and alert on suspicious patterns
 */

import prisma from '@/lib/prisma';
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
      const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalAlerts = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        const suspiciousActivities: string[] = [];

        // Check for excessive refunds
        const refundsToday = await prisma.transaction.count({
          where: {
            tenantId,
            status: 'refunded',
            updatedAt: { gte: today },
          },
        });

        if (refundsToday >= refundThreshold) {
          suspiciousActivities.push(`Excessive refunds: ${refundsToday} refunds today (threshold: ${refundThreshold})`);
        }

        // Check for excessive voids/cancellations
        const voidsToday = await prisma.transaction.count({
          where: {
            tenantId,
            status: 'cancelled',
            createdAt: { gte: today },
          },
        });

        if (voidsToday >= voidThreshold) {
          suspiciousActivities.push(`Excessive voids: ${voidsToday} cancelled transactions today (threshold: ${voidThreshold})`);
        }

        // Check for large discounts
        const largeDiscountsCount = await prisma.transaction.count({
          where: {
            tenantId,
            discountAmount: { gte: discountThreshold },
            createdAt: { gte: today },
          },
        });

        if (largeDiscountsCount > 0) {
          suspiciousActivities.push(`Large discounts detected: ${largeDiscountsCount} transactions with discounts >= $${discountThreshold}`);
        }

        // Check for failed login attempts
        const failedLogins = await prisma.auditLog.count({
          where: {
            tenantId,
            action: 'LOGIN',
            metadata: { path: ['success'], equals: false },
            createdAt: { gte: today },
          },
        });

        if (failedLogins >= failedLoginThreshold) {
          suspiciousActivities.push(`Multiple failed login attempts: ${failedLogins} failed logins today (threshold: ${failedLoginThreshold})`);
        }

        // Check for cash drawer discrepancies
        const drawersWithDiscrepanciesCount = await prisma.cashDrawerSession.count({
          where: {
            tenantId,
            closingTime: { gte: today },
            OR: [
              { shortage: { gte: 50 } },
              { overage: { gte: 100 } },
            ],
          },
        });

        if (drawersWithDiscrepanciesCount > 0) {
          suspiciousActivities.push(`Cash drawer discrepancies: ${drawersWithDiscrepanciesCount} drawers with significant shortages/overages`);
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
