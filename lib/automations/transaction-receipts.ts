/**
 * Transaction Receipt Auto-Email
 * Automatically emails receipts for transactions
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import Tenant from '@/models/Tenant'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { formatDate, formatTime } from '@/lib/formatting';
import { formatCurrency } from '@/lib/currency';
import { AutomationResult } from './types';

export interface TransactionReceiptOptions {
  tenantId?: string;
  transactionId?: string;
  customerEmail?: string;
}

/**
 * Send receipt email for a specific transaction
 */
export async function sendTransactionReceipt(
  options: TransactionReceiptOptions
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
    if (!options.transactionId) {
      results.success = false;
      results.message = 'Transaction ID is required';
      return results;
    }

    const transaction = await Transaction.findById(options.transactionId)
      .populate('tenantId')
      .lean();

    if (!transaction) {
      results.success = false;
      results.message = 'Transaction not found';
      return results;
    }

    const tenantId = transaction.tenantId.toString();
    const tenantSettings = await getTenantSettingsById(tenantId);

    // Check if email notifications are enabled
    if (!tenantSettings?.emailNotifications) {
      results.message = 'Email notifications disabled for this tenant';
      return results;
    }

    // Get customer email (from transaction notes or options)
    const customerEmail = options.customerEmail || transaction.notes?.match(/email[:\s]+([^\s]+)/i)?.[1];

    if (!customerEmail) {
      results.message = 'Customer email not found';
      return results;
    }

    // Generate receipt content
    const companyName = tenantSettings?.companyName || 'Business';
    const receiptNumber = transaction.receiptNumber || transaction._id.toString().slice(-8);
    const formattedDate = formatDate(transaction.createdAt, tenantSettings);
    const formattedTime = formatTime(transaction.createdAt, tenantSettings);

    // Build receipt HTML
    const itemsList = transaction.items
      .map(
        (item) =>
          `  <tr>
    <td>${item.name}</td>
    <td style="text-align: center;">${item.quantity}</td>
    <td style="text-align: right;">${formatCurrency(item.price, tenantSettings)}</td>
    <td style="text-align: right;">${formatCurrency(item.subtotal, tenantSettings)}</td>
  </tr>`
      )
      .join('\n');

    const receiptHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .receipt { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .info { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f4f4f4; font-weight: bold; }
    .total { border-top: 2px solid #000; padding-top: 10px; margin-top: 10px; }
    .total-row { font-weight: bold; font-size: 1.1em; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h2>${companyName}</h2>
      ${tenantSettings?.address ? `<p>${[tenantSettings.address.street, tenantSettings.address.city, tenantSettings.address.state, tenantSettings.address.zipCode].filter(Boolean).join(', ')}</p>` : ''}
      ${tenantSettings?.phone ? `<p>${tenantSettings.phone}</p>` : ''}
    </div>
    
    <div class="info">
      <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
      <p><strong>Date:</strong> ${formattedDate}</p>
      <p><strong>Time:</strong> ${formattedTime}</p>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Price</th>
          <th style="text-align: right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
${itemsList}
      </tbody>
    </table>

    <div class="total">
      <p><strong>Subtotal:</strong> ${formatCurrency(transaction.subtotal, tenantSettings)}</p>
      ${transaction.discountAmount ? `<p><strong>Discount:</strong> -${formatCurrency(transaction.discountAmount, tenantSettings)}</p>` : ''}
      ${transaction.taxAmount ? `<p><strong>${tenantSettings?.taxLabel || 'Tax'}:</strong> ${formatCurrency(transaction.taxAmount, tenantSettings)}</p>` : ''}
      <p class="total-row"><strong>Total:</strong> ${formatCurrency(transaction.total, tenantSettings)}</p>
      <p><strong>Payment Method:</strong> ${transaction.paymentMethod.toUpperCase()}</p>
      ${transaction.cashReceived ? `<p><strong>Cash Received:</strong> ${formatCurrency(transaction.cashReceived, tenantSettings)}</p>` : ''}
      ${transaction.change ? `<p><strong>Change:</strong> ${formatCurrency(transaction.change, tenantSettings)}</p>` : ''}
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      ${tenantSettings?.receiptFooter || ''}
    </div>
  </div>
</body>
</html>
    `.trim();

    // Send email
    await sendEmail({
      to: customerEmail,
      subject: `Receipt from ${companyName} - ${receiptNumber}`,
      message: receiptHtml,
      type: 'email',
    });

    results.processed = 1;
    results.message = 'Receipt sent successfully';

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error sending receipt: ${error.message}`;
    results.errors?.push(error.message);
    results.failed = 1;
    return results;
  }
}

/**
 * Send receipts for recent transactions that haven't been emailed
 * This can be called periodically to catch any missed receipts
 */
export async function sendPendingReceipts(
  options: { tenantId?: string; hoursAgo?: number } = {}
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
    const hoursAgo = options.hoursAgo || 24;
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    // Find transactions without receipt email sent
    // Note: We'll need to add a field to track if receipt was sent
    // For now, we'll check transactions with customer email in notes
    const query: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      createdAt: { $gte: since },
      status: 'completed',
    };

    if (options.tenantId) {
      query.tenantId = options.tenantId;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    let processed = 0;
    let failed = 0;

    for (const transaction of transactions) {
      try {
        // Try to extract email from notes or skip if no email
        const emailMatch = transaction.notes?.match(/email[:\s]+([^\s]+)/i);
        if (!emailMatch) {
          continue;
        }

        const result = await sendTransactionReceipt({
          transactionId: transaction._id.toString(),
          customerEmail: emailMatch[1],
        });

        if (result.success && result.processed > 0) {
          processed++;
        } else {
          failed++;
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        failed++;
        results.errors?.push(`Transaction ${transaction._id}: ${error.message}`);
      }
    }

    results.processed = processed;
    results.failed = failed;
    results.message = `Processed ${processed} receipts${failed > 0 ? `, ${failed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error processing pending receipts: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
