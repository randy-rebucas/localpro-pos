/**
 * Dynamic Pricing Automation
 * Automatically adjust prices based on demand, time, or stock levels
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';
import mongoose from 'mongoose'; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface DynamicPricingOptions {
  tenantId?: string;
  enableTimeBased?: boolean; // Enable time-based pricing (e.g., happy hour)
  enableDemandBased?: boolean; // Enable demand-based pricing
  enableStockBased?: boolean; // Enable stock-based pricing (clearance)
}

/**
 * Apply dynamic pricing rules
 * Note: This is a framework - actual pricing rules need to be configured per tenant
 */
export async function applyDynamicPricing(
  options: DynamicPricingOptions = {}
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
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalUpdated = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId); // eslint-disable-line @typescript-eslint/no-unused-vars

        // Get products
        const products = await Product.find({ tenantId }).lean();

        for (const product of products) {
          try {
            let newPrice = product.price;
            let priceChanged = false;
            const now = new Date();
            const currentHour = now.getHours();

            // Time-based pricing (e.g., happy hour 2-4 PM: 10% discount)
            if (options.enableTimeBased && currentHour >= 14 && currentHour < 16) {
              newPrice = product.price * 0.9; // 10% discount
              priceChanged = true;
            }

            // Stock-based pricing (clearance: 20% discount if stock > 50)
            if (options.enableStockBased && product.stock > 50) {
              newPrice = product.price * 0.8; // 20% discount for clearance
              priceChanged = true;
            }

            // Demand-based pricing (increase price if high demand)
            if (options.enableDemandBased) {
              const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              const recentSales = await Transaction.countDocuments({
                tenantId,
                'items.product': product._id,
                createdAt: { $gte: last7Days },
                status: 'completed',
              });

              if (recentSales > 20) {
                // High demand - increase price by 5%
                newPrice = product.price * 1.05;
                priceChanged = true;
              }
            }

            // Update product price if changed
            if (priceChanged && newPrice !== product.price) {
              await Product.findByIdAndUpdate(product._id, {
                price: Math.round(newPrice * 100) / 100, // Round to 2 decimals
              });
              totalUpdated++;
            }
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Product ${product._id}: ${error.message}`);
          }
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
