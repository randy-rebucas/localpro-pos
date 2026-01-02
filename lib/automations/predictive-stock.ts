/**
 * Predictive Stock Replenishment
 * Predict future stock needs based on historical sales patterns
 */

import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';
import mongoose from 'mongoose';

export interface PredictiveStockOptions {
  tenantId?: string;
  analysisDays?: number; // Days of history to analyze (default: 30)
  predictionDays?: number; // Days ahead to predict (default: 7)
}

/**
 * Analyze sales patterns and predict stock needs
 */
export async function predictStockNeeds(
  options: PredictiveStockOptions = {}
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
    const analysisDays = options.analysisDays || 30;
    const predictionDays = options.predictionDays || 7;
    const analysisStartDate = new Date(Date.now() - analysisDays * 24 * 60 * 60 * 1000);

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

    let totalPredictions = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Get all products with inventory tracking
        const products = await Product.find({
          tenantId,
          trackInventory: true,
        }).lean();

        const predictions: any[] = [];

        for (const product of products) {
          try {
            // Get sales history for this product
            const salesHistory = await Transaction.aggregate([
              {
                $match: {
                  tenantId: new mongoose.Types.ObjectId(tenantId),
                  createdAt: { $gte: analysisStartDate },
                  status: 'completed',
                  'items.product': product._id,
                },
              },
              {
                $unwind: '$items',
              },
              {
                $match: {
                  'items.product': product._id,
                },
              },
              {
                $group: {
                  _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                  },
                  quantity: { $sum: '$items.quantity' },
                },
              },
              {
                $sort: { _id: 1 },
              },
            ]);

            if (salesHistory.length === 0) {
              continue; // No sales history
            }

            // Calculate average daily sales
            const totalQuantity = salesHistory.reduce((sum, day) => sum + day.quantity, 0);
            const avgDailySales = totalQuantity / analysisDays;

            // Predict future needs
            const predictedNeeds = avgDailySales * predictionDays;

            // Get current stock
            const currentStock = product.stock || 0;
            const threshold = product.lowStockThreshold || tenantSettings?.lowStockThreshold || 10;

            // Predict when stock will hit threshold
            const daysUntilThreshold = currentStock > threshold
              ? Math.floor((currentStock - threshold) / avgDailySales)
              : 0;

            // If predicted to hit threshold within prediction window, suggest reorder
            if (daysUntilThreshold <= predictionDays && currentStock > 0) {
              const suggestedReorderQuantity = Math.ceil(predictedNeeds + threshold - currentStock);

              predictions.push({
                productId: product._id,
                productName: product.name,
                sku: product.sku,
                currentStock,
                avgDailySales: Math.round(avgDailySales * 100) / 100,
                predictedNeeds: Math.ceil(predictedNeeds),
                daysUntilThreshold,
                suggestedReorderQuantity,
              });
            }
          } catch (error: any) {
            // Skip product on error
          }
        }

        if (predictions.length > 0 && tenantSettings?.emailNotifications && tenantSettings?.email) {
          const companyName = tenantSettings?.companyName || tenant.name || 'Business';
          
          const predictionsList = predictions.slice(0, 20).map(p => 
            `- ${p.productName}${p.sku ? ` (SKU: ${p.sku})` : ''}
  Current Stock: ${p.currentStock}
  Avg Daily Sales: ${p.avgDailySales}
  Predicted Needs (${predictionDays} days): ${p.predictedNeeds}
  Days Until Threshold: ${p.daysUntilThreshold}
  Suggested Reorder: ${p.suggestedReorderQuantity} units`
          ).join('\n\n');

          const emailBody = `Predictive Stock Replenishment Report for ${companyName}

Analysis Period: Last ${analysisDays} days
Prediction Window: Next ${predictionDays} days

The following products are predicted to need replenishment:

${predictionsList}
${predictions.length > 20 ? `\n... and ${predictions.length - 20} more products` : ''}

This is an automated predictive analysis from your POS system.`;

          await sendEmail({
            to: tenantSettings.email,
            subject: `Predictive Stock Replenishment Report - ${companyName}`,
            message: emailBody,
            type: 'email',
          }).catch(() => {
            // Don't fail if email fails
          });

          totalPredictions += predictions.length;
        }
      } catch (error: any) {
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalPredictions;
    results.failed = totalFailed;
    results.message = `Generated ${totalPredictions} stock predictions${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) {
    results.success = false;
    results.message = `Error predicting stock needs: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
