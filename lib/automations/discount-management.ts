/**
 * Automatic Discount Activation/Deactivation
 * Auto-activate and deactivate discounts based on dates and conditions
 */

import connectDB from '@/lib/mongodb';
import Discount from '@/models/Discount';
import { sendEmail } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

const USAGE_ALERT_THRESHOLDS = [80, 90, 100];

// usageLimit is set (> 0) and usageCount has reached it
const USAGE_EXHAUSTED_EXPR = {
  $and: [{ $gt: ['$usageLimit', 0] }, { $gte: ['$usageCount', '$usageLimit'] }],
};

export interface DiscountManagementOptions {
  tenantId?: string;
}

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
    const tenants = await getAutomationTenants({ tenantId: options.tenantId });

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
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;
        const notifyEmail = tenantSettings?.emailNotifications ? tenantSettings.email : undefined;

        // Discounts that need activation (validFrom has arrived, but not active).
        // Usage-exhausted ones are excluded so they don't flip back on every run.
        const activateFilter = {
          tenantId,
          isActive: false,
          validFrom: { $lte: now },
          validUntil: { $gte: now },
          $expr: { $not: [USAGE_EXHAUSTED_EXPR] },
        };

        // Discounts that need deactivation (validUntil has passed or usage limit reached, but still active)
        const deactivateFilter = {
          tenantId,
          isActive: true,
          $or: [{ validUntil: { $lt: now } }, { $expr: USAGE_EXHAUSTED_EXPR }],
        };

        if (!notifyEmail) {
          // No notifications to send: just flip the flags in two writes
          const [activated, deactivated] = await Promise.all([
            Discount.updateMany(activateFilter, { $set: { isActive: true } }),
            Discount.updateMany(deactivateFilter, { $set: { isActive: false } }),
          ]);
          totalActivated += activated.modifiedCount;
          totalDeactivated += deactivated.modifiedCount;
          continue;
        }

        // Notifications enabled: load the affected discounts (for the email content), then batch the writes
        const [discountsToActivate, discountsToDeactivate] = await Promise.all([
          Discount.find(activateFilter).select('code name validUntil usageLimit').lean(),
          Discount.find(deactivateFilter).select('code name validUntil usageLimit usageCount').lean(),
        ]);

        // Activate discounts
        if (discountsToActivate.length > 0) {
          await Discount.updateMany(
            { tenantId, _id: { $in: discountsToActivate.map((d) => d._id) }, isActive: false },
            { $set: { isActive: true } }
          );
          totalActivated += discountsToActivate.length;

          for (const discount of discountsToActivate) {
            await sendEmail({
              to: notifyEmail,
              subject: `Discount Activated: ${discount.code}`,
              message: `The discount "${discount.code}" (${discount.name || 'No name'}) has been automatically activated.\n\nValid until: ${discount.validUntil.toLocaleDateString()}\nUsage limit:${discount.usageLimit || 'Unlimited'}`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }
        }

        // Deactivate discounts
        if (discountsToDeactivate.length > 0) {
          await Discount.updateMany(
            { tenantId, _id: { $in: discountsToDeactivate.map((d) => d._id) }, isActive: true },
            { $set: { isActive: false } }
          );
          totalDeactivated += discountsToDeactivate.length;

          for (const discount of discountsToDeactivate) {
            const reason = discount.validUntil < now
              ? 'expired (validUntil date passed)'
              : 'reached usage limit';

            await sendEmail({
              to: notifyEmail,
              subject: `Discount Deactivated: ${discount.code}`,
              message: `The discount "${discount.code}" (${discount.name || 'No name'}) has been automatically deactivated.\n\nReason: ${reason}\nUsage count:${discount.usageCount || 0}${discount.usageLimit ? ` / ${discount.usageLimit}` : ''}`,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }
        }

        // Check for discounts approaching usage limits (#10 - Discount Usage Limit Alerts).
        // Only discounts at >= 80% that haven't been alerted for their current threshold yet.
        const activeDiscounts = await Discount.find({
          tenantId,
          isActive: true,
          usageLimit: { $gt: 0 },
          $expr: { $gte: [{ $multiply: ['$usageCount', 100] }, { $multiply: ['$usageLimit', USAGE_ALERT_THRESHOLDS[0]] }] },
        })
          .select('code name usageLimit usageCount usageAlertThreshold')
          .lean();

        const alertUpdates = [];
        for (const discount of activeDiscounts) {
          if (!discount.usageLimit) continue;

          const usagePercent = (discount.usageCount / discount.usageLimit) * 100;
          // Highest threshold reached; alert once per threshold
          const threshold = [...USAGE_ALERT_THRESHOLDS].reverse().find((t) => usagePercent >= t);
          if (!threshold || (discount.usageAlertThreshold ?? 0) >= threshold) continue;

          const companyName = tenantSettings?.companyName || tenant.name || 'Business';

          await sendEmail({
            to: notifyEmail,
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

          alertUpdates.push({
            updateOne: {
              filter: { tenantId, _id: discount._id },
              update: { $set: { usageAlertThreshold: threshold } },
            },
          });
        }

        if (alertUpdates.length > 0) {
          await Discount.bulkWrite(alertUpdates, { ordered: false });
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
