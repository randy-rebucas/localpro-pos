/**
 * Automatic Discount Activation/Deactivation
 * Auto-activate and deactivate discounts based on dates and conditions
 */

import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import Tenant from '@/models/Tenant';
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

/** usageLimit set and reached (usageLimit 0/null means unlimited, as in /api/discounts/validate). */
const LIMIT_REACHED_EXPR = {
  $and: [
    { $gt: [{ $ifNull: ['$usageLimit', 0] }, 0] },
    { $gte: [{ $ifNull: ['$usageCount', 0] }, '$usageLimit'] },
  ],
};

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
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
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

        // Discounts that need activation: validFrom arrived during this window,
        // still valid, not active, and not already used up
        const activateFilter = {
          tenantId: tenant._id,
          isActive: false,
          validFrom: { $gt: activationWindowStart, $lte: now },
          validUntil: { $gte: now },
          $expr: { $not: [LIMIT_REACHED_EXPR] },
        };

        // Discounts that need deactivation: still active but expired or used up
        const deactivateFilter = {
          tenantId: tenant._id,
          isActive: true,
          $or: [{ validUntil: { $lt: now } }, { $expr: LIMIT_REACHED_EXPR }],
        };

        // Only read the documents when an email needs their details; otherwise
        // the two updateMany calls below are the entire cost for this tenant.
        const fields = 'code name validUntil usageLimit usageCount';
        const [discountsToActivate, discountsToDeactivate] = notify
          ? await Promise.all([
              Discount.find(activateFilter).select(fields).lean(),
              Discount.find(deactivateFilter).select(fields).lean(),
            ])
          : [null, null];

        // Activate discounts (one write)
        const activateRes = await Discount.updateMany(
          discountsToActivate
            ? { ...activateFilter, _id: { $in: discountsToActivate.map((d) => d._id) } }
            : activateFilter,
          { $set: { isActive: true } }
        );
        totalActivated += activateRes.modifiedCount ?? 0;

        // Deactivate discounts (one write)
        const deactivateRes = await Discount.updateMany(
          discountsToDeactivate
            ? { ...deactivateFilter, _id: { $in: discountsToDeactivate.map((d) => d._id) } }
            : deactivateFilter,
          { $set: { isActive: false } }
        );
        totalDeactivated += deactivateRes.modifiedCount ?? 0;

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
          const activeDiscounts = await Discount.find({
            tenantId: tenant._id,
            isActive: true,
            usageLimit: { $gt: 0 },
            updatedAt: { $gt: windowStart },
          })
            .select('code name usageLimit usageCount')
            .lean();

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
