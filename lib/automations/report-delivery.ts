/**
 * Scheduled Report Generation and Delivery
 * Automatically generates and emails reports on schedule
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { getSalesReport } from '@/lib/analytics';
import { AutomationResult } from './types';

export interface ReportDeliveryOptions {
  tenantId?: string;
  reportType?: 'daily' | 'weekly' | 'monthly';
  period?: 'daily' | 'weekly' | 'monthly';
}

/**
 * Generate and send sales report
 */
export async function sendSalesReport(
  options: ReportDeliveryOptions = {}
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
    const period = options.period || 'daily';

    // Get tenants to process
    let tenants;
    if (options.tenantId) {
      const tenant = await Tenant.findById(options.tenantId).lean();
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants
      tenants = await Tenant.find({ status: 'active' }).lean();
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

        // Skip if email notifications disabled
        if (!tenantSettings?.emailNotifications) {
          continue;
        }

        // Get recipient email
        const recipientEmail = tenantSettings?.email;
        if (!recipientEmail) {
          continue; // No email to send to
        }

        // Calculate date range based on period
        const endDate = new Date();
        let startDate: Date;

        switch (period) {
          case 'daily':
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 1);
            break;
          case 'weekly':
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'monthly':
            startDate = new Date(endDate);
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          default:
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 1);
        }

        // Generate report
        const report = await getSalesReport(
          tenant._id.toString(),
          period,
          startDate,
          endDate
        );

        // Format report data
        const companyName = tenantSettings?.companyName || tenant.name || 'Business';
        const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
        const dateRange = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;

        // Build report HTML
        const dailyRows = report.salesByDay?.map((item: { date: string; sales: number; transactions: number }) => `
        <tr>
          <td>${new Date(item.date).toLocaleDateString()}</td>
          <td style="text-align: right;">${item.sales?.toFixed(2) || '0.00'}</td>
          <td style="text-align: right;">${item.transactions || 0}</td>
        </tr>
        `).join('') ?? '';
        const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .report { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .summary { background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .summary-item strong { font-size: 1.1em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f4f4f4; font-weight: bold; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h2>${periodLabel} Sales Report</h2>
      <p>${companyName}</p>
      <p>${dateRange}</p>
    </div>

    <div class="summary">
      <div class="summary-item">
        <span><strong>Total Sales:</strong></span>
        <span><strong>${report.totalSales?.toFixed(2) || '0.00'}</strong></span>
      </div>
      <div class="summary-item">
        <span>Total Transactions:</span>
        <span>${report.totalTransactions || 0}</span>
      </div>
      <div class="summary-item">
        <span>Average Transaction:</span>
        <span>${report.averageTransaction?.toFixed(2) || '0.00'}</span>
      </div>
    </div>

    ${report.salesByPaymentMethod ? `
    <h3>Sales by Payment Method</h3>
    <table>
      <thead>
        <tr>
          <th>Payment Method</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Cash</td>
          <td style="text-align: right;">${report.salesByPaymentMethod.cash?.toFixed(2) || '0.00'}</td>
        </tr>
        <tr>
          <td>Card</td>
          <td style="text-align: right;">${report.salesByPaymentMethod.card?.toFixed(2) || '0.00'}</td>
        </tr>
        <tr>
          <td>Digital</td>
          <td style="text-align: right;">${report.salesByPaymentMethod.digital?.toFixed(2) || '0.00'}</td>
        </tr>
      </tbody>
    </table>
    ` : ''}

    ${report.salesByDay && report.salesByDay.length > 0 ? `
    <h3>Daily Breakdown</h3>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th style="text-align: right;">Sales</th>
          <th style="text-align: right;">Transactions</th>
        </tr>
      </thead>
      <tbody>
        ${dailyRows}
      </tbody>
    </table>
    ` : ''}

    <div class="footer">
      <p>This is an automated report from your POS system.</p>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
        `.trim();

        // Send email
        await sendEmail({
          to: recipientEmail,
          subject: `${periodLabel} Sales Report - ${companyName}`,
          message: reportHtml,
          type: 'email',
        });

        totalProcessed++;
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Processed ${totalProcessed} reports${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending reports: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
