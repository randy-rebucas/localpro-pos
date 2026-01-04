/**
 * Automatic End-of-Day Cash Drawer Closure
 * Automatically close cash drawers at end of business day
 */

import connectDB from '@/lib/mongodb';
import CashDrawerSession from '@/models/CashDrawerSession';
import Tenant from '@/models/Tenant';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { AutomationResult } from './types';

export interface CashDrawerClosureOptions {
  tenantId?: string;
  forceClose?: boolean; // Force close even if not end of day
}

/**
 * Automatically close cash drawers at end of business day
 */
export async function autoCloseCashDrawers(
  options: CashDrawerClosureOptions = {}
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
      // Get all active tenants
      tenants = await Tenant.find({ status: 'active' }).lean();
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    const now = new Date();
    const currentHour = now.getHours();
    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id.toString();
        const tenantSettings = await getTenantSettingsById(tenantId);

        // Get business hours (if configured)
        // For now, we'll use a default end time (e.g., 10 PM) or check if it's past business hours
        // You can extend this to use tenant business hours configuration
        const defaultEndHour = 22; // 10 PM
        const isEndOfDay = currentHour >= defaultEndHour || options.forceClose;

        if (!isEndOfDay && !options.forceClose) {
          continue; // Not end of day yet
        }

        // Find all open cash drawer sessions
        const openSessions = await CashDrawerSession.find({
          tenantId,
          status: 'open',
        })
          .populate('userId', 'name email')
          .lean();

        for (const session of openSessions) {
          try {
            // Calculate expected amount
            const sessionStart = new Date(session.openingTime);
            const sessionEnd = now;

            // Get cash transactions for this session
            const cashTransactions = await Transaction.find({
              tenantId,
              paymentMethod: 'cash',
              createdAt: { $gte: sessionStart, $lte: sessionEnd },
              status: 'completed',
            }).lean();

            const cashSales = cashTransactions.reduce((sum, t) => sum + t.total, 0);

            // Get cash expenses for this session
            const cashExpenses = await Expense.find({
              tenantId,
              paymentMethod: 'cash',
              date: { $gte: sessionStart, $lte: sessionEnd },
            }).lean();

            const cashExpensesTotal = cashExpenses.reduce((sum, e) => sum + e.amount, 0);

            // Calculate expected amount
            const expectedAmount = session.openingAmount + cashSales - cashExpensesTotal;

            // For auto-closure, we'll set closing amount to expected (no physical count)
            // In production, you might want to flag these for review
            const closingAmount = expectedAmount;

            // Calculate shortage/overage (will be 0 for auto-closure, but calculated for reporting)
            const actualDifference = closingAmount - expectedAmount;
            const shortage = actualDifference < 0 ? Math.abs(actualDifference) : 0;
            const overage = actualDifference > 0 ? actualDifference : 0;

            // Update session
            await CashDrawerSession.findByIdAndUpdate(session._id, {
              status: 'closed',
              closingTime: sessionEnd,
              closingAmount,
              expectedAmount,
              shortage: shortage > 0 ? shortage : undefined,
              overage: overage > 0 ? overage : undefined,
              notes: (session.notes || '') + (session.notes ? '\n' : '') + '[AUTO] Automatically closed at end of business day.',
            });

            totalProcessed++;

            // Check for discrepancies (#13 - Cash Drawer Discrepancy Alerts)
            const discrepancyThreshold = {
              shortage: 10, // $10
              overage: 20, // $20
            };
            
            const hasDiscrepancy = shortage > discrepancyThreshold.shortage || overage > discrepancyThreshold.overage;
            const isLargeDiscrepancy = shortage > 50 || overage > 100; // Large discrepancies need immediate attention

            // Send summary report to managers
            if (tenantSettings?.emailNotifications && tenantSettings?.email) {
              const companyName = tenantSettings?.companyName || tenant.name || 'Business';
              const user = session.userId as { name?: string; email?: string } | null;
              
              const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .report { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .summary { background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .alert { background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h2>End of Day Cash Drawer Report</h2>
      <p>${companyName}</p>
      <p>${sessionEnd.toLocaleDateString()} ${sessionEnd.toLocaleTimeString()}</p>
    </div>

    <div class="summary">
      <h3>Session Summary</h3>
      <div class="summary-item">
        <span><strong>Cashier:</strong></span>
        <span>${user?.name || 'Unknown'}</span>
      </div>
      <div class="summary-item">
        <span><strong>Opening Amount:</strong></span>
        <span>$${session.openingAmount.toFixed(2)}</span>
      </div>
      <div class="summary-item">
        <span><strong>Cash Sales:</strong></span>
        <span>$${cashSales.toFixed(2)}</span>
      </div>
      <div class="summary-item">
        <span><strong>Cash Expenses:</strong></span>
        <span>$${cashExpensesTotal.toFixed(2)}</span>
      </div>
      <div class="summary-item">
        <span><strong>Expected Amount:</strong></span>
        <span>$${expectedAmount.toFixed(2)}</span>
      </div>
      <div class="summary-item">
        <span><strong>Closing Amount:</strong></span>
        <span>$${closingAmount.toFixed(2)}</span>
      </div>
      ${shortage > 0 ? `
      <div class="alert">
        <strong>⚠️ Shortage:</strong> $${shortage.toFixed(2)}
      </div>
      ` : ''}
      ${overage > 0 ? `
      <div class="alert">
        <strong>ℹ️ Overage:</strong> $${overage.toFixed(2)}
      </div>
      ` : ''}
    </div>

    <p><em>This drawer was automatically closed at end of business day. Please verify the closing amount.</em></p>
  </div>
</body>
</html>
              `.trim();

              const subject = hasDiscrepancy
                ? `⚠️ Cash Drawer Discrepancy Alert - ${companyName}`
                : `End of Day Cash Drawer Report - ${companyName}`;

              await sendEmail({
                to: tenantSettings.email,
                subject,
                message: reportHtml,
                type: 'email',
              }).catch(() => {
                // Don't fail if email fails
              });

              // Send immediate alert for large discrepancies
              if (isLargeDiscrepancy && tenantSettings?.email) {
                await sendEmail({
                  to: tenantSettings.email,
                  subject: `🚨 URGENT: Large Cash Drawer Discrepancy - ${companyName}`,
                  message: `URGENT: Large Cash Drawer Discrepancy Detected

Cashier: ${user?.name || 'Unknown'}
Session ID: ${session._id.toString().slice(-8)}
Time: ${sessionEnd.toLocaleString()}

${shortage > 50 ? `SHORTAGE: $${shortage.toFixed(2)}` : ''}
${overage > 100 ? `OVERAGE: $${overage.toFixed(2)}` : ''}

Expected Amount: $${expectedAmount.toFixed(2)}
Closing Amount: $${closingAmount.toFixed(2)}

This requires immediate review. Please investigate this discrepancy as soon as possible.

This is an automated security alert from your POS system.`,
                  type: 'email',
                }).catch(() => {
                  // Don't fail if email fails
                });
              }
            }
          } catch (error: unknown) {
            totalFailed++;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.errors?.push(`Session ${session._id}: ${errorMessage}`);
          }
        }
      } catch (error: unknown) {
        totalFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.errors?.push(`Tenant ${tenant.name}: ${errorMessage}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Auto-closed ${totalProcessed} cash drawers${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: unknown) {
    results.success = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    results.message = `Error auto-closing cash drawers: ${errorMessage}`;
    results.errors?.push(errorMessage);
    return results;
  }
}
