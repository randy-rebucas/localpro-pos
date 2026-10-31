/**
 * Low Stock Email/SMS Alerts
 * Sends notifications when products reach low stock thresholds
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { getLowStockProducts } from '@/lib/stock';
import { sendEmail, sendSMS } from '@/lib/notifications';
import { renderNotificationTemplate } from '@/lib/notification-templates';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

// Re-alert a tenant about still-low products at most once per this window
const ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
    // Get tenants to process: inventory + low stock alerts on (both default true)
    // and at least one notification channel enabled (both default false)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.enableInventory': { $ne: false },
        'settings.lowStockAlert': { $ne: false },
        $or: [
          { 'settings.emailNotifications': true },
          { 'settings.smsNotifications': true },
        ],
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = tenant.settings;

        // Skip if notifications disabled (manual single-tenant runs bypass the filter)
        if (!tenantSettings?.emailNotifications && !tenantSettings?.smsNotifications) {
          continue;
        }

        // Skip if low stock alerts disabled (defaults to on)
        if (tenantSettings?.lowStockAlert === false) {
          continue;
        }

        // Get low stock products
        const threshold = options.threshold || tenantSettings?.lowStockThreshold || 10;
        const lowStockProducts = await getLowStockProducts(
          tenant._id.toString(),
          undefined,
          threshold,
          { select: 'name sku stock lowStockThreshold hasVariations variations.stock lowStockAlertedAt' }
        );

        if (lowStockProducts.length === 0) {
          continue; // No low stock products
        }

        // The job runs hourly; alert each tenant at most once per day. Any low-stock
        // product stamped within the window means this tenant was already alerted.
        const now = new Date();
        const alertCutoff = now.getTime() - ALERT_INTERVAL_MS;
        const alertedRecently = lowStockProducts.some(
          (product: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
            product.lowStockAlertedAt && new Date(product.lowStockAlertedAt).getTime() > alertCutoff
        );
        if (alertedRecently) {
          continue;
        }

        // Prepare alert message
        const companyName = tenantSettings?.companyName || tenant.name || 'Business';
        const emailTemplate = tenantSettings?.notificationTemplates?.email?.lowStockAlert;
        const smsTemplate = tenantSettings?.notificationTemplates?.sms?.lowStockAlert;

        // The configured template's variables ({{productName}}, {{currentStock}}, ...) are
        // per-product, so render one line per product with it (falling back to the default
        // bullet format when no template is set) rather than ignoring the tenant's template.
        const productList = lowStockProducts
          .slice(0, 20) // Limit to 20 products in email
          .map((product: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const vars = {
              productName: product.name,
              sku: product.sku || '',
              currentStock: product.currentStock || 0,
              threshold: product.threshold || threshold,
            };
            if (emailTemplate) {
              const body = emailTemplate.includes('|') ? emailTemplate.split('|')[1] : emailTemplate;
              return renderNotificationTemplate(body, vars, tenantSettings);
            }
            return `- ${product.name}${product.sku ? ` (SKU: ${product.sku})` : ''}: ${product.currentStock || 0} units (Threshold: ${product.threshold || threshold})`;
          })
          .join('\n');

        const moreProducts = lowStockProducts.length > 20
          ? `\n... and ${lowStockProducts.length - 20} more products`
          : '';

        const emailSubject = emailTemplate && emailTemplate.includes('|')
          ? renderNotificationTemplate(emailTemplate.split('|')[0], {
              productName: lowStockProducts[0].name,
              currentStock: lowStockProducts[0].currentStock || 0,
              threshold: lowStockProducts[0].threshold || threshold,
              sku: lowStockProducts[0].sku || '',
            }, tenantSettings)
          : `Low Stock Alert - ${lowStockProducts.length} Product${lowStockProducts.length > 1 ? 's' : ''}`;
        const emailBody = `Low Stock Alert for ${companyName}

The following products are running low on stock:

${productList}${moreProducts}

Please review your inventory and consider reordering these items.

This is an automated alert from your POS system.`;

        const smsBody = smsTemplate
          ? lowStockProducts
              .slice(0, 3)
              .map((product: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
                renderNotificationTemplate(smsTemplate, {
                  productName: product.name,
                  sku: product.sku || '',
                  currentStock: product.currentStock || 0,
                  threshold: product.threshold || threshold,
                }, tenantSettings)
              )
              .join(' | ')
          : `Low Stock Alert: ${lowStockProducts.length} product${lowStockProducts.length > 1 ? 's' : ''} below threshold. Check your POS system for details.`;

        // Get recipient email/phone from tenant settings
        const recipientEmail = tenantSettings?.email;
        const recipientPhone = tenantSettings?.phone;

        const processedBefore = totalProcessed;

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
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Email to ${recipientEmail}: ${error.message}`);
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
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`SMS to ${recipientPhone}: ${error.message}`);
          }
        }

        // Mark the alerted products so the next hourly runs skip this tenant
        if (totalProcessed > processedBefore) {
          await Product.updateMany(
            { tenantId: tenant._id, _id: { $in: lowStockProducts.map((p: any) => p._id) } }, // eslint-disable-line @typescript-eslint/no-explicit-any
            { $set: { lowStockAlertedAt: now } }
          );
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Processed ${totalProcessed} low stock alerts${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending low stock alerts: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
