/**
 * Low Stock Email/SMS Alerts
 * Sends notifications when products reach low stock thresholds
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { getLowStockProducts } from '@/lib/stock';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface LowStockAlertOptions {
  tenantId?: string;
  threshold?: number;
}

/**
 * Send low stock alerts for all tenants or a specific tenant
 */
export async function sendLowStockAlerts(
  options: LowStockAlertOptions = {}
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
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants with inventory enabled
      tenants = await Tenant.find({
        status: 'active',
        'settings.enableInventory': true,
        'settings.lowStockAlert': true,
      }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = await getTenantSettingsById(tenant._id.toString());

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Skip if low stock alerts disabled
        if (!tenantSettings?.lowStockAlert) {
          continue;
        }

        // Get low stock products
        const threshold = options.threshold || tenantSettings?.lowStockThreshold || 10;
        const lowStockProducts = await getLowStockProducts(
          tenant._id.toString(),
          undefined,
          threshold
        );

        if (lowStockProducts.length === 0) {
          continue; // No low stock products
        }

        // Prepare alert message
        const companyName = tenantSettings?.companyName || tenant.name || 'Business';
        const productList = lowStockProducts
          .slice(0, 20) // Limit to 20 products in email
          .map(
            (product: { name: string; sku?: string; currentStock?: number; threshold?: number }) =>
              `- ${product.name}${product.sku ? ` (SKU: ${product.sku})` : ''}: ${product.currentStock || 0} units (Threshold: ${product.threshold || threshold})`
          )
          .join('\n');

        const moreProducts = lowStockProducts.length > 20
          ? `\n... and ${lowStockProducts.length - 20} more products`
          : '';

        const emailSubject = `Low Stock Alert - ${lowStockProducts.length} Product${lowStockProducts.length > 1 ? 's' : ''}`;
        const emailBody = `Low Stock Alert for ${companyName}

The following products are running low on stock:

${productList}${moreProducts}

Please review your inventory and consider reordering these items.

This is an automated alert from your POS system.`;

        const smsBody = `Low Stock Alert: ${lowStockProducts.length} product${lowStockProducts.length > 1 ? 's' : ''} below threshold. Check your POS system for details.`;

        // Get recipient email/phone from tenant settings
        const recipientEmail = tenantSettings?.email;
        const recipientPhone = tenantSettings?.phone;

        // Send email alert
        if (recipientEmail && tenantSettings?.emailNotifications) {
          try {
            await sendEmail({
              to: recipientEmail,
              subject: emailSubject,
              message: emailBody,
              type: 'email',
            });
            totalProcessed++;
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`Email to ${recipientEmail}: ${errorMessage}`);
          }
        }

        // Send SMS alert
        if (recipientPhone && tenantSettings?.smsNotifications) {
          try {
            await sendSMS({
              to: recipientPhone,
              message: smsBody,
              type: 'sms',
            });
            totalProcessed++;
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`SMS to ${recipientPhone}: ${errorMessage}`);
          }
        }
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Processed ${totalProcessed} low stock alerts${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error sending low stock alerts: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
