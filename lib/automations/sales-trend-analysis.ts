/**
 * Automated Sales Trend Analysis
 * Analyze sales trends and send insights
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import { sendEmail } from '@/lib/notifications';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';
import { formatYmd, localPeriodBefore, previousCompleteLocalPeriod, tenantTimezone } from './local-time';

export interface SalesTrendAnalysisOptions {
  tenantId?: string;
  period?: 'daily' | 'weekly' | 'monthly';
  comparePeriods?: boolean; // Compare with previous period
  /** Reference "now" (tests / backfills); defaults to the current time. */
  now?: Date;
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

    // Get tenants to process (only those with email notifications and a recipient)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: {
        'settings.emailNotifications': true,
        'settings.email': { $nin: [null, ''] },
      },
    });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalAnalyses = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        // Skip if notifications disabled or nowhere to send (manual runs bypass the loader filter)
        if (!tenantSettings?.emailNotifications || !tenantSettings?.email) {
          continue;
        }

        // Analyse the most recent complete local period (yesterday / last Mon–Sun
        // week / last calendar month in the tenant's timezone) and compare it with
        // the period before it. The job runs at ~08:00 tenant time.
        const tz = tenantTimezone(tenantSettings);
        const current = previousCompleteLocalPeriod(options.now ?? new Date(), period, tz);
        const previous = localPeriodBefore(current, period, tz);
        const currentPeriodStart = current.start;
        const currentPeriodEnd = current.end;
        const previousPeriodStart = previous.start;
        const previousPeriodEnd = previous.end;

        // Current and (optionally) previous period sales in one aggregate
        const periodRanges: Record<string, unknown>[] = [
          { createdAt: { $gte: currentPeriodStart, $lte: currentPeriodEnd } },
        ];
        if (comparePeriods) {
          periodRanges.push({ createdAt: { $gte: previousPeriodStart, $lte: previousPeriodEnd } });
        }
        const periodSales = await Transaction.aggregate<{
          _id: 'current' | 'previous';
          totalSales: number;
          transactionCount: number;
          avgTransaction: number;
        }>([
          {
            $match: {
              tenantId,
              status: 'completed',
              $or: periodRanges,
            },
          },
          {
            $group: {
              _id: {
                $cond: [{ $gte: ['$createdAt', currentPeriodStart] }, 'current', 'previous'],
              },
              totalSales: { $sum: '$total' },
              transactionCount: { $sum: 1 },
              avgTransaction: { $avg: '$total' },
            },
          },
        ]);

        const emptyPeriod = { totalSales: 0, transactionCount: 0, avgTransaction: 0 };
        const currentData = periodSales.find(p => p._id === 'current') || emptyPeriod;
        const previousData = comparePeriods
          ? periodSales.find(p => p._id === 'previous') || emptyPeriod
          : null;

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

Current Period: ${current.startYmd === current.endYmd ? formatYmd(current.startYmd) : `${formatYmd(current.startYmd)} - ${formatYmd(current.endYmd)}`}

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
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalAnalyses;
    results.failed = totalFailed;
    results.message = `Generated ${totalAnalyses} sales trend analyses${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error analyzing sales trends: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
