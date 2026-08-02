/**
 * Product Performance Alerts
 * Alert on product performance changes
 */

import prisma from '@/lib/prisma';
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
        const products = await prisma.product.findMany({
          where: { tenantId, trackInventory: true },
        });

        const slowMovingProducts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        const topPerformers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

        for (const product of products) {
          try {
            // Get sales totals for this product in the analysis period
            const salesAgg = await prisma.$queryRaw<{ total_quantity: number | null; total_revenue: number | null }[]>`
              SELECT SUM(ti.quantity)::int as total_quantity, SUM(ti.subtotal)::float as total_revenue
              FROM transaction_items ti
              JOIN transactions t ON t.id = ti.transaction_id
              WHERE t.tenant_id = ${tenantId}::uuid
                AND ti.product_id = ${product.id}::uuid
                AND t.created_at >= ${analysisStartDate}
                AND t.status = 'completed'
            `;

            const salesData = salesAgg[0] || { total_quantity: 0, total_revenue: 0 };
            const salesCount = Number(salesData.total_quantity || 0);
            const revenue = Number(salesData.total_revenue || 0);

            // Get last sale date
            const lastSaleRow = await prisma.$queryRaw<{ created_at: Date }[]>`
              SELECT t.created_at
              FROM transaction_items ti
              JOIN transactions t ON t.id = ti.transaction_id
              WHERE t.tenant_id = ${tenantId}::uuid
                AND ti.product_id = ${product.id}::uuid
                AND t.status = 'completed'
              ORDER BY t.created_at DESC
              LIMIT 1
            `;

            const lastSale = lastSaleRow[0];
            const daysSinceLastSale = lastSale
              ? Math.floor((Date.now() - new Date(lastSale.created_at).getTime()) / (1000 * 60 * 60 * 24))
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
