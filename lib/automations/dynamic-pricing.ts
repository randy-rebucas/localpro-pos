/**
 * Dynamic Pricing Automation
 * Automatically adjust prices based on demand, time, or stock levels
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import { getTenantLocalParts } from '@/lib/timezone';
import { getAutomationTenants } from './tenants';
import { tenantTimezone } from './local-time';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

export interface DynamicPricingOptions {
  tenantId?: string;
  enableTimeBased?: boolean; // Enable time-based pricing (e.g., happy hour)
  enableDemandBased?: boolean; // Enable demand-based pricing
  enableStockBased?: boolean; // Enable stock-based pricing (clearance)
  /** Reference "now" (tests); defaults to the current time. */
  now?: Date;
}

/** Happy hour window, tenant-local wall-clock hours [start, end). */
export const HAPPY_HOUR = { startHour: 14, endHour: 16 };

/**
 * Apply dynamic pricing rules
 * Note: This is a framework - actual pricing rules need to be configured per tenant
 */
export async function applyDynamicPricing(
  options: DynamicPricingOptions = {}
): Promise<AutomationResult> {
  const results: AutomationResult = {
    success: true,
    message: '',
    processed: 0,
    failed: 0,
    errors: [],
  };

  // Nothing to do without at least one rule; skip all DB access
  if (!options.enableTimeBased && !options.enableDemandBased && !options.enableStockBased) {
    results.message = 'No dynamic pricing rules enabled';
    return results;
  }

  await connectDB();

  try {
    // Get tenants to process
    const tenants = await getAutomationTenants({ tenantId: options.tenantId, select: 'name settings.timezone' });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalUpdated = 0;
    let totalFailed = 0;

    const now = options.now ?? new Date();
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;

        // Time-based rules use the tenant's local wall clock, not the server's (UTC)
        const currentHour = getTenantLocalParts(now, tenantTimezone(tenant.settings)).hour;
        const isHappyHour = currentHour >= HAPPY_HOUR.startHour && currentHour < HAPPY_HOUR.endHour;

        // Get products
        const products = await Product.find({ tenantId })
          .select('price basePrice stock')
          .lean();

        if (products.length === 0) {
          continue;
        }

        // Demand: number of completed transactions per product in the last 7 days
        // (one aggregate per tenant; $setUnion counts each transaction once per product)
        const recentSalesMap = new Map<string, number>();
        if (options.enableDemandBased) {
          const recentSales: Array<{ _id: mongoose.Types.ObjectId; count: number }> =
            await Transaction.aggregate([
              {
                $match: {
                  tenantId,
                  status: 'completed',
                  createdAt: { $gte: last7Days },
                },
              },
              { $project: { products: { $setUnion: ['$items.product', []] } } },
              { $unwind: '$products' },
              { $group: { _id: '$products', count: { $sum: 1 } } },
            ]);
          for (const row of recentSales) {
            if (row._id) recentSalesMap.set(row._id.toString(), row.count);
          }
        }

        const updates: mongoose.AnyBulkWriteOperation[] = [];

        for (const product of products) {
          // Rules apply to the original price so adjustments don't compound across runs
          const basePrice = product.basePrice ?? product.price;
          let multiplier = 1;

          // Time-based pricing (e.g., happy hour 2-4 PM: 10% discount)
          if (options.enableTimeBased && isHappyHour) {
            multiplier = 0.9; // 10% discount
          }

          // Stock-based pricing (clearance: 20% discount if stock > 50)
          if (options.enableStockBased && product.stock > 50) {
            multiplier = 0.8; // 20% discount for clearance
          }

          // Demand-based pricing (increase price if high demand)
          if (options.enableDemandBased && (recentSalesMap.get(product._id.toString()) || 0) > 20) {
            // High demand - increase price by 5%
            multiplier = 1.05;
          }

          if (multiplier === 1) {
            // No rule applies: restore the original price and drop the marker
            if (product.basePrice != null) {
              updates.push({
                updateOne: {
                  filter: { _id: product._id, tenantId },
                  update: { $set: { price: product.basePrice }, $unset: { basePrice: 1 } },
                },
              });
              if (product.basePrice !== product.price) totalUpdated++;
            }
            continue;
          }

          const newPrice = Math.round(basePrice * multiplier * 100) / 100; // Round to 2 decimals

          // Only write when the price actually changes
          if (newPrice !== product.price) {
            updates.push({
              updateOne: {
                filter: { _id: product._id, tenantId },
                update: {
                  $set: {
                    price: newPrice,
                    // Remember the original price on the first adjustment
                    ...(product.basePrice == null ? { basePrice: product.price } : {}),
                  },
                },
              },
            });
            totalUpdated++;
          }
        }

        if (updates.length > 0) {
          await Product.bulkWrite(updates, { ordered: false });
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalUpdated;
    results.failed = totalFailed;
    results.message = `Updated ${totalUpdated} product prices${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error applying dynamic pricing: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
