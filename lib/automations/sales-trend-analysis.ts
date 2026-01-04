/**
 * Automated Sales Trend Analysis
 * Analyze sales trends and send insights
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant';
import mongoose from 'mongoose';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface SalesTrendAnalysisOptions {
  tenantId?: string;
  period?: 'daily' | 'weekly' | 'monthly';
  comparePeriods?: boolean; // Compare with previous period
}

/**
 * Analyze sales trends and send insights
 */
export async function analyzeSalesTrends(
  options: SalesTrendAnalysisOptions = {}
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
    const period = options.period || 'weekly';
    const comparePeriods = options.comparePeriods !== false;

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

    let totalAnalyses = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Skip if notifications disabled
        if (!tenantSettings?.emailNotifications) {
          continue;
        }

        const now = new Date();
        let currentPeriodStart: Date;
        const currentPeriodEnd: Date = now;
        let previousPeriodStart: Date;
        let previousPeriodEnd: Date;

        // Calculate period dates
        switch (period) {
          case 'daily':
            currentPeriodStart = new Date(now);
            currentPeriodStart.setHours(0, 0, 0, 0);
            previousPeriodStart = new Date(currentPeriodStart);
            previousPeriodStart.setDate(previousPeriodStart.getDate() - 1);
            previousPeriodEnd = new Date(currentPeriodStart);
            break;
          case 'weekly':
            const dayOfWeek = now.getDay();
            currentPeriodStart = new Date(now);
            currentPeriodStart.setDate(currentPeriodStart.getDate() - dayOfWeek);
            currentPeriodStart.setHours(0, 0, 0, 0);
            previousPeriodStart = new Date(currentPeriodStart);
            previousPeriodStart.setDate(previousPeriodStart.getDate() - 7);
            previousPeriodEnd = new Date(currentPeriodStart);
            break;
          case 'monthly':
            currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        }

        // Get current period sales
        const currentSales = await Transaction.aggregate([
          {
            $match: {
              tenantId: new mongoose.Types.ObjectId(tenantId),
              createdAt: { $gte: currentPeriodStart, $lte: currentPeriodEnd },
              status: 'completed',
            },
          },
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$total' },
              transactionCount: { $sum: 1 },
              avgTransaction: { $avg: '$total' },
            },
          },
        ]);

        const currentData = currentSales[0] || {
          totalSales: 0,
          transactionCount: 0,
          avgTransaction: 0,
        };

        let previousData = null;
        if (comparePeriods) {
          const previousSales = await Transaction.aggregate([
            {
              $match: {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd },
                status: 'completed',
              },
            },
            {
              $group: {
                _id: null,
                totalSales: { $sum: '$total' },
                transactionCount: { $sum: 1 },
                avgTransaction: { $avg: '$total' },
              },
            },
          ]);

          previousData = previousSales[0] || {
            totalSales: 0,
            transactionCount: 0,
            avgTransaction: 0,
          };
        }

        // Calculate trends
        let trendAnalysis = '';
        let salesChange = 0;
        let salesChangePercent = '0';
        
        if (previousData) {
          salesChange = currentData.totalSales - previousData.totalSales;
          salesChangePercent = previousData.totalSales > 0
            ? ((salesChange / previousData.totalSales) * 100).toFixed(1)
            : '0';

          const transactionChange = currentData.transactionCount - previousData.transactionCount;
          const transactionChangePercent = previousData.transactionCount > 0
            ? ((transactionChange / previousData.transactionCount) * 100).toFixed(1)
            : '0';

          const salesChangeNum = parseFloat(salesChangePercent || '0');
          trendAnalysis = `
COMPARISON WITH PREVIOUS ${period.toUpperCase()}:

Sales: ${salesChange >= 0 ? '+' : ''}$${salesChange.toFixed(2)} (${salesChangePercent}%)
Transactions: ${transactionChange >= 0 ? '+' : ''}${transactionChange} (${transactionChangePercent}%)

${salesChangeNum > 0 ? '📈 Sales are increasing!' : salesChangeNum < 0 ? '📉 Sales are decreasing' : '➡️ Sales are stable'}
`;
        }

        const companyName = tenantSettings?.companyName || tenant.name || 'Business';
        const emailBody = `${period.toUpperCase()} Sales Trend Analysis for ${companyName}

Current Period: ${currentPeriodStart.toLocaleDateString()} - ${currentPeriodEnd.toLocaleDateString()}

CURRENT PERIOD STATISTICS:
- Total Sales: $${currentData.totalSales.toFixed(2)}
- Transaction Count: ${currentData.transactionCount}
- Average Transaction: $${currentData.avgTransaction.toFixed(2)}
${trendAnalysis}

${previousData && parseFloat(salesChangePercent || '0') > 0 ? '💡 Suggestion: Consider increasing inventory for high-performing products.' : ''}
${previousData && parseFloat(salesChangePercent || '0') < 0 ? '💡 Suggestion: Review marketing strategies and consider promotions.' : ''}

This is an automated sales trend analysis from your POS system.`;

        if (tenantSettings.email) {
          await sendEmail({
            to: tenantSettings.email,
            subject: `${period.charAt(0).toUpperCase() + period.slice(1)} Sales Trend Analysis - ${companyName}`,
            message: emailBody,
            type: 'email',
          }).catch(() => {
            // Don't fail if email fails
          });
        }

        totalAnalyses++;
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalAnalyses;
    results.failed = totalFailed;
    results.message = `Generated ${totalAnalyses} sales trend analyses${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error analyzing sales trends: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
