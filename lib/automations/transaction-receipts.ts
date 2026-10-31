/**
 * Transaction Receipt Auto-Email
 * Automatically emails receipts for transactions
 */

import connectDB from '@/lib/mongodb';
import Transaction from '@/models/Transaction';
import type { ITransaction } from '@/models/Transaction';
import type { ITenantSettings } from '@/models/Tenant';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { formatDate, formatTime } from '@/lib/formatting';
import { formatCurrency } from '@/lib/currency';
import { getAutomationTenants } from './tenants';
import { AutomationResult } from './types';

export interface TransactionReceiptOptions {
  tenantId?: string;
  transactionId?: string;
  customerEmail?: string;
}

// Only the fields the receipt email uses
const RECEIPT_FIELDS =
  'tenantId receiptNumber createdAt items.name items.quantity items.price items.subtotal ' +
  'subtotal discountAmount taxAmount total paymentMethod cashReceived change notes';

type ReceiptTransaction = Pick<
  ITransaction,
  | 'tenantId' | 'receiptNumber' | 'createdAt' | 'items' | 'subtotal' | 'discountAmount'
  | 'taxAmount' | 'total' | 'paymentMethod' | 'cashReceived' | 'change' | 'notes'
> & { _id: { toString(): string } };

function extractCustomerEmail(notes?: string): string | undefined {
  return notes?.match(/email[:\s]+([^\s]+)/i)?.[1];
}

/**
 * Build and send the receipt email. Throws if the email could not be sent.
 */
async function emailReceipt(
  transaction: ReceiptTransaction,
  tenantSettings: ITenantSettings,
  customerEmail: string
): Promise<void> {
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
  const sent = await sendEmail({
    to: customerEmail,
    subject: `Receipt from ${companyName} - ${receiptNumber}`,
    message: receiptHtml,
    type: 'email',
  });
  if (!sent) {
    throw new Error('Failed to send receipt email');
  }
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

    const transaction = await Transaction.findOne({
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      _id: options.transactionId,
    })
      .select(RECEIPT_FIELDS)
      .lean<ReceiptTransaction>();

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
    const customerEmail = options.customerEmail || extractCustomerEmail(transaction.notes);

    if (!customerEmail) {
      results.message = 'Customer email not found';
      return results;
    }

    await emailReceipt(transaction, tenantSettings, customerEmail);

    // Mark as sent so the pending-receipts job doesn't send it again
    await Transaction.updateOne(
      { tenantId: transaction.tenantId, _id: transaction._id },
      { $set: { receiptSentAt: new Date() } }
    );

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

    // Get tenants to process (receipts are email-only)
    const tenants = await getAutomationTenants({
      tenantId: options.tenantId,
      filter: { 'settings.emailNotifications': true },
    });

    let processed = 0;
    let failed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = tenant.settings;
        // Manual single-tenant runs skip the filter
        if (!tenantSettings?.emailNotifications) continue;

        // Recent completed transactions whose receipt hasn't been sent yet and
        // that have a customer email in the notes
        const transactions = await Transaction.find({
          tenantId: tenant._id,
          status: 'completed',
          createdAt: { $gte: since },
          receiptSentAt: { $exists: false },
          notes: { $regex: /email[:\s]+\S/i },
        })
          .select(RECEIPT_FIELDS)
          .sort({ createdAt: -1 })
          .limit(100)
          .lean<ReceiptTransaction[]>();

        const sentIds: ReceiptTransaction['_id'][] = [];

        for (const transaction of transactions) {
          try {
            // Try to extract email from notes or skip if no email
            const customerEmail = extractCustomerEmail(transaction.notes);
            if (!customerEmail) {
              continue;
            }

            await emailReceipt(transaction, tenantSettings, customerEmail);
            sentIds.push(transaction._id);
            processed++;
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            failed++;
            results.errors?.push(`Transaction ${transaction._id}: ${error.message}`);
          }
        }

        // Mark sent receipts in one write
        if (sentIds.length > 0) {
          await Transaction.updateMany(
            { tenantId: tenant._id, _id: { $in: sentIds } },
            { $set: { receiptSentAt: new Date() } }
          );
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        failed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
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
