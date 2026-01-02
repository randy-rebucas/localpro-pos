/**
 * Abandoned Cart Reminders
 * Remind customers about saved/abandoned carts
 */

import connectDB from '@/lib/mongodb';
import SavedCart from '@/models/SavedCart';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface AbandonedCartOptions {
  tenantId?: string;
  hoursAgo?: number; // Hours since cart was saved to consider abandoned (default: 24)
}

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
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

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

    let totalReminders = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Skip if email notifications disabled
        if (!tenantSettings?.emailNotifications) {
          continue;
        }

        // Find saved carts that haven't been converted to transactions
        // Carts saved more than X hours ago
        const abandonedCarts = await SavedCart.find({
          tenantId,
          updatedAt: { $lte: cutoffTime },
        })
          .populate('userId', 'name email')
          .sort({ updatedAt: -1 })
          .limit(100) // Limit to prevent too many emails
          .lean();

        for (const cart of abandonedCarts) {
          try {
            const user = cart.userId as any;
            if (!user || !user.email) {
              continue; // Skip if no user or email
            }

            // Check if cart was already converted to transaction
            // (This is a simple check - in production, you might want to track this better)
            const recentTransactions = await Transaction.find({
              tenantId,
              userId: user._id,
              createdAt: { $gte: cart.updatedAt },
            }).limit(1).lean();

            if (recentTransactions.length > 0) {
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
    .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
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
          } catch (error: any) {
            totalFailed++;
            results.errors?.push(`Cart ${cart._id}: ${error.message}`);
          }
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalReminders;
    results.failed = totalFailed;
    results.message = `Sent ${totalReminders} abandoned cart reminders${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error sending abandoned cart reminders: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
