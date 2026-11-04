/**
 * Automatic Discount Activation/Deactivation
 * Auto-activate and deactivate discounts based on dates and conditions
 */

import connectDB from '@/lib/mongodb';
import { getRepos } from '@/lib/db';
import type { ITenantSettings } from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface DiscountManagementOptions {
  tenantId?: string;
  /**
   * Run window in hours (default: 6, matching the `0 *\/6 * * *` schedule in
   * vercel.json). Discount has no "auto-managed"/"alert sent" fields, so:
   *  - auto-activation only applies to discounts whose validFrom arrived within
   *    the window — a discount a manager switched off by hand later in its
   *    validity period is NOT switched back on every run;
   *  - usage alerts only fire for discounts used (updatedAt) within the window.
   */
  windowHours?: number;
}

const TENANT_FIELDS = 'settings.emailNotifications settings.email settings.companyName';

/**
 * Automatically activate/deactivate discounts based on validity dates
 */
export async function manageDiscountStatus(
  options: DiscountManagementOptions = {}
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
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: `_id slug name ${TENANT_FIELDS}` })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    const now = new Date();
    const windowHours = options.windowHours || 6;
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    // Activation looks back 2h further than the schedule so a late or failed run
    // doesn't strand discounts that became valid in the gap (re-activating an
    // already-active discount is a no-op: the filter requires isActive:false)
    const activationWindowStart = new Date(windowStart.getTime() - 2 * 60 * 60 * 1000);
    let totalActivated = 0;
    let totalDeactivated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        const notify = !!(tenantSettings?.emailNotifications && tenantSettings?.email);

        const tenantId = String(tenant._id);
        const discountRepo = getRepos().discounts;

        // Only read the discounts when an email needs their details; otherwise
        // the two bulk writes are the entire cost for this tenant.
        // Activation: validFrom arrived during this window, still valid, not
        // active, and not already used up
        const activated = await discountRepo.activateDue(tenantId, {
          now,
          validFromAfter: activationWindowStart,
          withDocs: notify,
        });
        totalActivated += activated.modified;

        // Deactivation: still active but expired or used up
        const deactivated = await discountRepo.deactivateDue(tenantId, { now, withDocs: notify });
        totalDeactivated += deactivated.modified;

        const discountsToActivate = notify ? activated.discounts : null;
        const discountsToDeactivate = notify ? deactivated.discounts : null;

        if (notify && tenantSettings?.email) {
          // Send notification if enabled
          for (const discount of discountsToActivate ?? []) {
            await sendEmail({
              to: tenantSettings.email,
              subject: `Discount Activated: ${discount.code}`,
              message: `The discount "${discount.code}" (${discount.name || 'No name'}) has been automatically activated.\n\nValid until: ${new Date(discount.validUntil).toLocaleDateString()}\nUsage limit: ${discount.usageLimit || 'Unlimited'}`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }

          for (const discount of discountsToDeactivate ?? []) {
            const reason = new Date(discount.validUntil) < now
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

          // Check for discounts approaching usage limits (#10 - Discount Usage Limit Alerts)
          // Only discounts used since the previous run (updatedAt is bumped by the
          // $inc in /api/transactions), so an untouched discount isn't re-alerted.
          const activeDiscounts = await discountRepo.listLimitedUsedSince(tenantId, windowStart);

          for (const discount of activeDiscounts) {
            if (!discount.usageLimit) continue;

            const usagePercent = (discount.usageCount / discount.usageLimit) * 100;
            const alertThresholds = [80, 90, 100];

            // Check if we should send an alert (80%, 90%, or 100%)
            const shouldAlert = alertThresholds.some(threshold => {
              return usagePercent >= threshold && usagePercent < threshold + 5; // 5% window to avoid duplicate alerts
            });

            if (shouldAlert) {
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
