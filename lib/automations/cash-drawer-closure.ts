/**
 * Automatic End-of-Day Cash Drawer Closure
 * Automatically close cash drawers at end of business day
 */

import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import CashDrawerSession from '@/models/CashDrawerSession';
import Transaction from '@/models/Transaction';
import Expense from '@/models/Expense';
import User from '@/models/User'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { sendEmail } from '@/lib/notifications';
import type { ITenantSettings } from '@/models/Tenant';
import { getEffectiveHoursForDate, type BusinessHours, type Holiday } from '@/lib/business-hours';
import { getTenantDayBoundaries, getTenantLocalParts } from '@/lib/timezone';
import { getAutomationTenants } from './tenants';
import { formatTenantDateTime, hhmmToMinutes, tenantTimezone } from './local-time';
import { AutomationResult } from './types';

export interface CashDrawerClosureOptions {
  tenantId?: string;
  forceClose?: boolean; // Force close even if not end of day
  /** Reference "now" (tests); defaults to the current time. */
  now?: Date;
}

/** Local closing time used when the tenant has no business hours for the day. */
export const DEFAULT_CLOSE_TIME = '22:00';

/**
 * Whether the tenant's business day has ended at `now` (tenant-local time).
 * - Closed today (holiday / special closure / disabled weekday): yes.
 * - Today's close time from business hours (special hours, then the weekly
 *   schedule): yes once local time >= close time.
 * - Overnight hours (close <= open, e.g. 18:00–02:00): the business is still
 *   trading late in the evening, so not yet (only earlier-day sessions close).
 * - No business hours configured: yes from 22:00 local.
 */
export function isLocalEndOfBusinessDay(
  now: Date,
  settings: Pick<ITenantSettings, 'businessHours' | 'holidays'> | undefined | null,
  tz: string
): boolean {
  const hours = getEffectiveHoursForDate(
    now,
    settings?.businessHours as BusinessHours | undefined,
    settings?.holidays as Holiday[] | undefined,
    tz
  );
  if (!hours.enabled) return true;

  const { hour, minute } = getTenantLocalParts(now, tz);
  const nowMinutes = hour * 60 + minute;
  const close = hhmmToMinutes(hours.closeTime) ?? hhmmToMinutes(DEFAULT_CLOSE_TIME)!;
  const open = hhmmToMinutes(hours.openTime);
  if (hours.closeTime && open != null && close <= open) return false; // overnight hours
  return nowMinutes >= close;
}

/**
 * Sum `amountField` for every session window [start, end] in one aggregate.
 * Documents are bucketed by the sorted session start times; a session's total
 * is then the suffix sum of the buckets from its start onwards.
 */
async function sumPerSessionStart(
  model: mongoose.Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  match: Record<string, unknown>,
  dateField: string,
  amountField: string,
  starts: Date[],
  end: Date
): Promise<Map<number, number>> {
  const boundaries = [...new Set(starts.map(d => d.getTime()))].sort((a, b) => a - b);
  const totals = new Map<number, number>();
  if (boundaries.length === 0 || boundaries[0] > end.getTime()) return totals;

  const buckets = await model.aggregate<{ _id: Date; total: number }>([
    { $match: { ...match, [dateField]: { $gte: new Date(boundaries[0]), $lte: end } } },
    {
      $bucket: {
        groupBy: `$${dateField}`,
        boundaries: [...boundaries.map(t => new Date(t)), new Date(Math.max(end.getTime(), boundaries[boundaries.length - 1]) + 1)],
        output: { total: { $sum: `$${amountField}` } },
      },
    },
  ]);
  const byBoundary = new Map(buckets.map(b => [new Date(b._id).getTime(), b.total]));

  let running = 0;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    running += byBoundary.get(boundaries[i]) ?? 0;
    totals.set(boundaries[i], running);
  }
  return totals;
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
    const now = options.now ?? new Date();

    // Get tenants to process. "End of day" depends on each tenant's timezone and
    // business hours, so it is decided per tenant below.
    const tenants = await getAutomationTenants({ tenantId: options.tenantId });

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantId = tenant._id;
        const tenantSettings = tenant.settings;

        const tz = tenantTimezone(tenantSettings);
        const endOfDay = options.forceClose || isLocalEndOfBusinessDay(now, tenantSettings, tz);
        const localDayStart = getTenantDayBoundaries(now, tz).start;

        // Sessions opened before today's local midnight are left over from an
        // earlier business day and are always closed; today's sessions only once
        // the local business day has ended.
        const openSessions = await CashDrawerSession.find({
          tenantId,
          status: 'open',
          ...(endOfDay ? {} : { openingTime: { $lt: localDayStart } }),
        })
          .select('userId openingAmount openingTime notes')
          .populate('userId', 'name email')
          .lean();

        if (openSessions.length === 0) continue;

        const sessionEnd = now;
        const sessionStarts = openSessions.map(s => new Date(s.openingTime));

        // Cash sales and cash expenses for every session, one aggregate each
        const [cashSalesByStart, cashExpensesByStart] = await Promise.all([
          sumPerSessionStart(
            Transaction,
            { tenantId, status: 'completed', paymentMethod: 'cash' },
            'createdAt',
            'total',
            sessionStarts,
            sessionEnd
          ),
          sumPerSessionStart(
            Expense,
            { tenantId, paymentMethod: 'cash' },
            'date',
            'amount',
            sessionStarts,
            sessionEnd
          ),
        ]);

        for (const session of openSessions) {
          try {
            // Calculate expected amount
            const sessionStart = new Date(session.openingTime);
            const cashSales = cashSalesByStart.get(sessionStart.getTime()) ?? 0;
            const cashExpensesTotal = cashExpensesByStart.get(sessionStart.getTime()) ?? 0;

            // Calculate expected amount
            const expectedAmount = session.openingAmount + cashSales - cashExpensesTotal;

            // For auto-closure, we'll set closing amount to expected (no physical count)
            // In production, you might want to flag these for review
            const closingAmount = expectedAmount;

            // Calculate shortage/overage (will be 0 for auto-closure, but calculated for reporting)
            const actualDifference = closingAmount - expectedAmount;
            const shortage = actualDifference < 0 ? Math.abs(actualDifference) : 0;
            const overage = actualDifference > 0 ? actualDifference : 0;

            // Update session (status: 'open' guards against a concurrent manual close).
            // The unique open-session index allows at most one per tenant, so this
            // is effectively one write per tenant.
            const update: Record<string, unknown> = {
              status: 'closed',
              closingTime: sessionEnd,
              closingAmount,
              expectedAmount,
              notes: (session.notes || '') + (session.notes ? '\n' : '') + '[AUTO] Automatically closed at end of business day.',
            };
            if (shortage > 0) update.shortage = shortage;
            if (overage > 0) update.overage = overage;
            const writeResult = await CashDrawerSession.updateOne(
              { tenantId, _id: session._id, status: 'open' },
              { $set: update }
            );
            if (writeResult.modifiedCount === 0) continue;

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
              const user = session.userId as any; // eslint-disable-line @typescript-eslint/no-explicit-any
              
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
      <p>${formatTenantDateTime(sessionEnd, tz)}</p>
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
Time: ${formatTenantDateTime(sessionEnd, tz)}

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
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }
      } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        totalFailed++;
        results.errors?.push(`Tenant ${tenant.name}: ${error.message}`);
      }
    }

    results.processed = totalProcessed;
    results.failed = totalFailed;
    results.message = `Auto-closed ${totalProcessed} cash drawers${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`;

    return results;
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    results.success = false;
    results.message = `Error auto-closing cash drawers: ${error.message}`;
    results.errors?.push(error.message);
    return results;
  }
}
