/**
 * Product Performance Alerts
 * Alert on product performance changes
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import mongoose from 'mongoose';
import { sendEmail } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
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
  await connectDB();

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

    // Get tenants to process. The report is only delivered by email, so tenants
    // without email notifications and an address are filtered out up front.
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.enableInventory': { $ne: false },
        'settings.emailNotifications': true,
        'settings.email': { $nin: [null, ''] },
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalAlerts = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Skip if notifications disabled (manual single-tenant runs bypass the filter)
        if (!tenantSettings?.emailNotifications || !tenantSettings?.email) {
          continue;
        }

        // Get all products
        const products = await Product.find({ tenantId, trackInventory: true })
          .select('name sku')
          .lean();

        if (products.length === 0) {
          continue;
        }

        // Units, revenue and last sale per product in the analysis period, in one aggregate
        const salesByProduct: Array<{
          _id: mongoose.Types.ObjectId;
          totalQuantity: number;
          totalRevenue: number;
          lastSaleAt: Date;
        }> = await Transaction.aggregate([
          {
            $match: {
              tenantId,
              status: 'completed',
              createdAt: { $gte: analysisStartDate },
            },
          },
          { $project: { createdAt: 1, 'items.product': 1, 'items.quantity': 1, 'items.subtotal': 1 } },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalQuantity: { $sum: '$items.quantity' },
              totalRevenue: { $sum: '$items.subtotal' },
              lastSaleAt: { $max: '$createdAt' },
            },
          },
        ]);

        const salesMap = new Map(
          salesByProduct.filter(row => row._id).map(row => [row._id.toString(), row])
        );

        const daysSince = (date: Date) =>
          Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));

        // Products with no sales in the window need their last sale from older history.
        // When the slow-moving threshold fits inside the window every unsold product is
        // slow-moving and the date is only displayed, so only look up the ones shown.
        const unsoldProducts = products.filter(p => !salesMap.has(p._id.toString()));
        const lookupProducts = slowMovingThreshold <= daysToAnalyze
          ? unsoldProducts.slice(0, 20)
          : unsoldProducts;
        const lastSaleMap = new Map<string, Date>();
        if (lookupProducts.length > 0) {
          const lookupIds = lookupProducts.map(p => p._id);
          const lastSales: Array<{ _id: mongoose.Types.ObjectId; lastSaleAt: Date }> =
            await Transaction.aggregate([
              {
                $match: {
                  tenantId,
                  status: 'completed',
                  createdAt: { $lt: analysisStartDate },
                  'items.product': { $in: lookupIds },
                },
              },
              { $project: { createdAt: 1, 'items.product': 1 } },
              { $unwind: '$items' },
              { $match: { 'items.product': { $in: lookupIds } } },
              { $group: { _id: '$items.product', lastSaleAt: { $max: '$createdAt' } } },
            ]);
          for (const row of lastSales) {
            lastSaleMap.set(row._id.toString(), row.lastSaleAt);
          }
        }

        const slowMovingProducts: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
        const topPerformers: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

        for (const product of products) {
          const salesData = salesMap.get(product._id.toString());
          const salesCount = salesData?.totalQuantity || 0;
          const revenue = salesData?.totalRevenue || 0;

          const lastSaleAt = salesData?.lastSaleAt ?? lastSaleMap.get(product._id.toString());
          const daysSinceLastSale = lastSaleAt ? daysSince(lastSaleAt) : daysToAnalyze;

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
