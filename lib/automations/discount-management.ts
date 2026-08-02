/**
 * Automatic Discount Activation/Deactivation
 * Auto-activate and deactivate discounts based on dates and conditions
 */

import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface DiscountManagementOptions {
  tenantId?: string;
}

/**
 * Automatically activate/deactivate discounts based on validity dates
 */
export async function manageDiscountStatus(
  options: DiscountManagementOptions = {}
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
      // Get all active tenants
      tenants = await prisma.tenant.findMany({ where: { isActive: true } });
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    const now = new Date();
    let totalActivated = 0;
    let totalDeactivated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant.id;
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Find discounts that need activation (validFrom has arrived, but not active)
        const discountsToActivate = await prisma.discount.findMany({
          where: {
            tenantId,
            validFrom: { lte: now },
            validUntil: { gte: now },
            isActive: false,
          },
        });

        // Find discounts that need deactivation (validUntil has passed, but still active)
        // First, get all active discounts
        const allActiveDiscounts = await prisma.discount.findMany({
          where: {
            tenantId,
            isActive: true,
          },
        });

        // Filter discounts that need deactivation
        const discountsToDeactivate = allActiveDiscounts.filter((discount) => {
          // Check if validUntil has passed
          if (discount.validUntil < now) {
            return true;
          }
          // Check if usage limit reached
          if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
            return true;
          }
          return false;
        });

        // Activate discounts
        for (const discount of discountsToActivate) {
          try {
            await prisma.discount.update({ where: { id: discount.id }, data: { isActive: true } });
            totalActivated++;

            // Send notification if enabled
            if (tenantSettings?.emailNotifications && tenantSettings?.email) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business'; // eslint-disable-line @typescript-eslint/no-unused-vars
              await sendEmail({
                to: tenantSettings.email,
                subject: `Discount Activated: ${discount.code}`,
                message: `The discount "${discount.code}" (${discount.name || 'No name'}) has been automatically activated.\n\nValid until: ${discount.validUntil.toLocaleDateString()}\nUsage limit: ${discount.usageLimit || 'Unlimited'}`,
                type: 'email',
              }).catch(() => {
                // Don't fail if email fails
              });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Activate discount ${discount.code}: ${error.message}`);
          }
        }

        // Deactivate discounts
        for (const discount of discountsToDeactivate) {
          try {
            await prisma.discount.update({ where: { id: discount.id }, data: { isActive: false } });
            totalDeactivated++;

            // Send notification if enabled
            if (tenantSettings?.emailNotifications && tenantSettings?.email) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business'; // eslint-disable-line @typescript-eslint/no-unused-vars
              const reason = discount.validUntil < now
                ? 'expired (validUntil date passed)'
                : 'reached usage limit';

              await sendEmail({
                to: tenantSettings.email,
                subject: `Discount Deactivated: ${discount.code}`,
                message: `The discount "${discount.code}" (${discount.name || 'No name'}) has been automatically deactivated.\n\nReason: ${reason}\nUsage count: ${discount.usageCount || 0}${discount.usageLimit ? ` / ${discount.usageLimit}` : ''}`,
                type: 'email',
              }).catch(() => {
                // Don't fail if email fails
              });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Deactivate discount ${discount.code}: ${error.message}`);
          }
        }

        // Check for discounts approaching usage limits (#10 - Discount Usage Limit Alerts)
        const activeDiscounts = await prisma.discount.findMany({
          where: {
            tenantId,
            isActive: true,
            usageLimit: { not: null },
          },
        });

        for (const discount of activeDiscounts) {
          if (!discount.usageLimit) continue;

          const usagePercent = (discount.usageCount / discount.usageLimit) * 100;
          const alertThresholds = [80, 90, 100];

          // Check if we should send an alert (80%, 90%, or 100%)
          const shouldAlert = alertThresholds.some(threshold => {
            return usagePercent >= threshold && usagePercent < threshold + 5; // 5% window to avoid duplicate alerts
          });

          if (shouldAlert && tenantSettings?.emailNotifications && tenantSettings?.email) {
            const threshold = Math.floor(usagePercent / 10) * 10; // Round to nearest 10
            const companyName = tenantSettings?.companyName || tenant.name || 'Business';

            await sendEmail({
              to: tenantSettings.email,
              subject: `Discount Usage Alert: ${discount.code} - ${threshold}% Used`,
              message: `Discount Usage Alert for ${companyName}

The discount "${discount.code}" (${discount.name || 'No name'}) has reached ${usagePercent.toFixed(1)}% of its usage limit.

Current Usage: ${discount.usageCount} / ${discount.usageLimit}
Remaining Uses: ${discount.usageLimit - discount.usageCount}

${usagePercent >= 100 ? '⚠️ This discount has reached its usage limit and will be deactivated.' : 'Please review and consider creating a new discount if needed.'}

This is an automated alert from your POS system.`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalActivated + totalDeactivated;
    results.failed = totalFailed;
    results.message = `Activated ${totalActivated} discounts, deactivated ${totalDeactivated} discounts${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error managing discount status: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
