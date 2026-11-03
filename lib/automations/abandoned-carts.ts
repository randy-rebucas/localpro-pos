/**
 * Abandoned Cart Reminders
 * Remind customers about saved/abandoned carts
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SavedCart from '@/models/SavedCart';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import type { ITenantSettings } from '@/models/Tenant';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface AbandonedCartOptions {
  tenantId?: string;
  hoursAgo?: number; // Hours since cart was saved to consider abandoned (default: 24)
  /**
   * Width of the "became abandoned" window in hours (default: 12, matching the
   * `0 *\/12 * * *` schedule in vercel.json). SavedCart has no reminder flag, so a
   * cart is only picked up by the one run whose window contains
   * `updatedAt + hoursAgo` — i.e. each cart is reminded at most once.
   */
  windowHours?: number;
}

const TENANT_FIELDS = 'settings.emailNotifications settings.companyName settings.website';

/**
 * Send reminders for abandoned carts
 */
export async function sendAbandonedCartReminders(
  options: AbandonedCartOptions = {}
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
    const hoursAgo = options.hoursAgo || 24;
    const windowHours = options.windowHours || 12;
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const windowStart = new Date(cutoffTime.getTime() - windowHours * 60 * 60 * 1000);

    // Get tenants to process
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId)
        .select(`_id slug name ${TENANT_FIELDS}`)
        .lean<ActiveTenant>();
      tenants = tenant ? [tenant] : [];
    } else {
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;

        // Skip if email notifications disabled
        if (!tenantSettings?.emailNotifications) {
          continue;
        }

        const tenantObjectId = new mongoose.Types.ObjectId(String(tenant._id));

        // Find saved carts that became "abandoned" during this run's window
        const abandonedCarts = await SavedCart.find({
          tenantId: tenantObjectId,
          isActive: { $ne: false }, // skip soft-deleted carts
          updatedAt: { $gt: windowStart, $lte: cutoffTime },
        })
          .select('userId items total updatedAt')
          .populate('userId', 'name email')
          .sort({ updatedAt: -1 })
          .limit(100) // Limit to prevent too many emails
          .lean();

        if (abandonedCarts.length === 0) continue;

        // Last transaction per cart owner, in one query instead of one per cart
        const userIds = abandonedCarts
          .map((c) => (c.userId as unknown as { _id?: mongoose.Types.ObjectId } | null)?._id)
          .filter((id): id is mongoose.Types.ObjectId => !!id);
        const oldestCart = abandonedCarts.reduce(
          (min, c) => (c.updatedAt < min ? c.updatedAt : min),
          abandonedCarts[0].updatedAt
        );
        const lastTxRows = userIds.length
          ? await Transaction.aggregate<{ _id: mongoose.Types.ObjectId; last: Date }>([
              {
                $match: {
                  tenantId: tenantObjectId,
                  userId: { $in: userIds },
                  createdAt: { $gte: oldestCart },
                },
              },
              { $group: { _id: '$userId', last: { $max: '$createdAt' } } },
            ])
          : [];
        const lastTxByUser = new Map(lastTxRows.map((r) => [r._id.toString(), new Date(r.last)]));

        for (const cart of abandonedCarts) {
          try {
            const user = cart.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
            if (!user || !user.email) {
              continue; // Skip if no user or email
            }

            // Check if cart was already converted to transaction
            // (This is a simple check - in production, you might want to track this better)
            const lastTx = lastTxByUser.get(user._id.toString());
            if (lastTx && lastTx >= cart.updatedAt) {
              continue; // Cart was likely completed
            }

            const companyName = tenantSettings?.companyName || tenant.name || 'Business';
            const hoursSinceSaved = Math.round((Date.now() - cart.updatedAt.getTime()) / (1000 * 60 * 60));

            // Build cart items list
            const itemsList = cart.items
              .slice(0, 10) // Limit to 10 items in email
              .map(item => `  - ${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`)
              .join('\n');

            const moreItems = cart.items.length > 10 ? `\n  ... and ${cart.items.length - 10} more items` : '';

            const reminderHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .cart-items { background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .total { font-size: 1.2em; font-weight: bold; margin-top: 15px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #35979c; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Complete Your Purchase</h2>
      <p>${companyName}</p>
    </div>

    <p>Hello ${user.name || 'Valued Customer'},</p>
    
    <p>We noticed you saved a cart ${hoursSinceSaved} hour${hoursSinceSaved > 1 ? 's' : ''} ago but haven't completed your purchase yet.</p>
    
    <div class="cart-items">
      <h3>Your Saved Cart:</h3>
      <pre style="font-family: Arial, sans-serif;">${itemsList}${moreItems}</pre>
      <div class="total">Total: $${cart.total.toFixed(2)}</div>
    </div>
    
    <p>Don't miss out! Complete your purchase now.</p>
    
    <p style="text-align: center;">
      <a href="${tenantSettings?.website || '#'}" class="button">Complete Purchase</a>
    </p>
    
    <p>If you have any questions, please contact us.</p>
    
    <div class="footer">
      <p>This is an automated reminder from ${companyName}.</p>
      <p>If you've already completed this purchase, please ignore this email.</p>
    </div>
  </div>
</body>
</html>
            `.trim();

            await sendEmail({
              to: user.email,
              subject: `Complete Your Purchase - ${companyName}`,
              message: reminderHtml,
              type: 'email',
            });

            totalReminders++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Cart ${cart._id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalReminders;
    results.failed = totalFailed;
    results.message = `Sent ${totalReminders} abandoned cart reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending abandoned cart reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
