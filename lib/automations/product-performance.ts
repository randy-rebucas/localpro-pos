/**
 * Product Performance Alerts
 * Alert on product performance changes
 */

import prisma from '@/lib/db';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface ProductPerformanceOptions {
  tenantId?: string;
  daysToAnalyze?: number; // Days to look back for performance (default: 30)
  slowMovingThreshold?: number; // Days without sales to consider slow-moving (default: 30)
}

/**
 * Analyze product performance and send alerts
 */
export async function analyzeProductPerformance(
  options: ProductPerformanceOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    const daysToAnalyze = options.daysToAnalyze || 30;
    const slowMovingThreshold = options.slowMovingThreshold || 30;
    const analysisStartDate = new Date(Date.now() - daysToAnalyze * 24 * 60 * 60 * 1000);

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

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications) {
          continue;
        }

        // Get all products
        const products = await prisma.product.findMany({ where: { tenantId, trackInventory: true } });

        const slowMovingProducts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        const topPerformers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

        for (const product of products) {
          try {
            // Get sales for this product in the analysis period
            const items = await prisma.transactionItem.findMany({
              where: {
                productId: product.id,
                transaction: {
                  tenantId,
                  status: 'completed',
                  createdAt: { gte: analysisStartDate },
                },
              },
              select: { quantity: true, subtotal: true },
            });

            const salesCount = items.reduce((sum, i) => sum + i.quantity, 0);
            const revenue = items.reduce((sum, i) => sum + Number(i.subtotal), 0);

            // Get last sale date
            const lastItem = await prisma.transactionItem.findFirst({
              where: {
                productId: product.id,
                transaction: { tenantId, status: 'completed' },
              },
              orderBy: { transaction: { createdAt: 'desc' } },
              include: { transaction: { select: { createdAt: true } } },
            });

            const daysSinceLastSale = lastItem
              ? Math.floor((Date.now() - new Date(lastItem.transaction.createdAt).getTime()) / (1000 * 60 * 60 * 24))
              : daysToAnalyze;

            // Identify slow-moving products
            if (daysSinceLastSale >= slowMovingThreshold && salesCount === 0) {
              slowMovingProducts.push({
                ...product,
                daysSinceLastSale,
                salesCount,
                revenue,
              });
            }

            // Identify top performers (top 10 by revenue)
            if (revenue > 0) {
              topPerformers.push({
                ...product,
                daysSinceLastSale,
                salesCount,
                revenue,
              });
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            // Skip product on error
          }
        }

        // Sort top performers by revenue
        topPerformers.sort((a, b) => b.revenue - a.revenue);

        // Send alerts if there are slow-moving products or top performers to report
        if (slowMovingProducts.length > 0 || topPerformers.length > 0) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';

          const slowMovingList = slowMovingProducts.slice(0, 20).map(p =>
            `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}: No sales in ${p.daysSinceLastSale} days`
          ).join('\n');

          const topPerformersList = topPerformers.slice(0, 10).map(p =>
            `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}: $${p.revenue.toFixed(2)} revenue, ${p.salesCount} units sold`
          ).join('\n');

          const emailBody = `Product Performance Report for ${companyName}

Analysis Period: Last ${daysToAnalyze} days

${slowMovingProducts.length > 0 ? `
SLOW-MOVING PRODUCTS (${slowMovingProducts.length}):
${slowMovingList}
${slowMovingProducts.length > 20 ? `... and ${slowMovingProducts.length - 20} more` : ''}

Consider running promotions or reviewing pricing for these products.
` : ''}

${topPerformers.length > 0 ? `
TOP PERFORMERS (Top 10):
${topPerformersList}

Consider increasing stock levels for these products.
` : ''}

This is an automated product performance report from your POS system.`;

          if (tenantSettings.email) {
            await sendEmail({
              to: tenantSettings.email,
              subject: `Product Performance Report - ${companyName}`,
              message: emailBody,
              type: 'email',
            }).catch(() => {
              // Don't fail if email fails
            });
          }

          totalAlerts++;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalAlerts;
    results.failed = totalFailed;
    results.message = `Sent ${totalAlerts} product performance alerts${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error analyzing product performance: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
