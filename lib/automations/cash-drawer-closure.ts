/**
 * Automatic End-of-Day Cash Drawer Closure
 * Automatically close cash drawers at end of business day
 */

import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import type { ITenantSettings } from '@/models/Tenant';
import Transaction from '@/models/Transaction';
import { getRepos, type CashDrawerClosing, type CashDrawerSessionRepo } from '@/lib/db';
import { sendEmail } from '@/lib/notifications';
import { getActiveTenants, type ActiveTenant } from '@/lib/tenant-active-query';
import { AutomationResult } from './types';

export interface CashDrawerClosureOptions {
  tenantId?: string;
  forceClose?: boolean; // Force close even if not end of day
}

const TENANT_FIELDS = 'settings.emailNotifications settings.email settings.companyName settings.timezone';

const DEFAULT_END_HOUR = 22; // 10 PM tenant-local time

/** Current hour (0-23) in the tenant's timezone */
function tenantLocalHour(now: Date, timezone?: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone || 'Asia/Manila',
    }).format(now);
    return parseInt(hour, 10) % 24;
  } catch {
    return now.getUTCHours();
  }
}

interface SalesTotals {
  salesCents: number;
  vatCents: number;
  discountCents: number;
}

/**
 * Automatically close cash drawers at end of business day
 *
 * Expected amounts follow the manual close in app/api/cash-drawer/sessions:
 * cash sales are those rung up by the drawer's own cashier (userId) since the
 * drawer opened; cash expenses are tenant-wide since the drawer opened.
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
    // End of day is 10 PM in each tenant's own timezone. The job runs hourly
    // (vercel.json) and only touches tenants whose local hour is the closing
    // hour, so each tenant's drawers are closed once per day.
    // You can extend this to use tenant business hours configuration.
    const now = new Date();

    // Get tenants to process
    let tenants: ActiveTenant[];
    if (options.tenantId) {
      const tenant = (await getRepos().tenants.findById(options.tenantId, { select: `_id slug name ${TENANT_FIELDS}` })) as ActiveTenant | null;
      tenants = tenant ? [tenant] : [];
    } else {
      // Get all active tenants
      tenants = await getActiveTenants(TENANT_FIELDS);
    }

    if (tenants.length === 0) {
      results.message = 'No tenants found to process';
      return results;
    }

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const tenant of tenants) {
      try {
        const tenantSettings = (tenant.settings ?? null) as ITenantSettings | null;
        if (!options.forceClose && tenantLocalHour(now, tenantSettings?.timezone) !== DEFAULT_END_HOUR) {
          continue;
        }
        const tenantObjectId = new mongoose.Types.ObjectId(String(tenant._id));

        // Find all open cash drawer sessions
        const tenantId = String(tenant._id);
        const { cashDrawerSessions } = getRepos();
        const openSessions = await cashDrawerSessions.list(
          tenantId,
          { status: 'open' },
          { select: 'userId openingTime openingAmount notes', populateUser: true }
        );

        if (openSessions.length === 0) continue;

        const sessionEnd = now;
        const userIdOf = (s: (typeof openSessions)[number]): mongoose.Types.ObjectId | null => {
          const u = s.userId as unknown as { _id?: unknown } | null;
          if (!u) return null;
          const id = u._id ?? u; // populated doc or raw ObjectId (user deleted)
          return new mongoose.Types.ObjectId(String(id));
        };
        const earliestOpening = openSessions.reduce(
          (min, s) => (new Date(s.openingTime) < min ? new Date(s.openingTime) : min),
          new Date(openSessions[0].openingTime)
        );

        // Cash sales per session in ONE aggregate: the $or pre-filter uses the
        // { tenantId, userId, createdAt } index, then a $facet branch per session
        // sums that cashier's sales since that drawer opened (in cents).
        const sessionBranches = openSessions
          .map((s, i) => ({ key: `s${i}`, userId: userIdOf(s), opening: new Date(s.openingTime) }))
          .filter((b): b is { key: string; userId: mongoose.Types.ObjectId; opening: Date } => !!b.userId);
        const salesBySession = new Map<string, SalesTotals>();
        if (sessionBranches.length > 0) {
          const centsOf = (field: string) => ({
            $sum: { $round: [{ $multiply: [{ $ifNull: [field, 0] }, 100] }, 0] },
          });
          const facet: Record<string, mongoose.PipelineStage.FacetPipelineStage[]> = {};
          for (const b of sessionBranches) {
            facet[b.key] = [
              { $match: { userId: b.userId, createdAt: { $gte: b.opening } } },
              {
                $group: {
                  _id: null,
                  salesCents: centsOf('$total'),
                  vatCents: centsOf('$taxAmount'),
                  discountCents: centsOf('$discountAmount'),
                },
              },
            ];
          }
          const [facetResult] = await Transaction.aggregate<Record<string, SalesTotals[]>>([
            {
              $match: {
                tenantId: tenantObjectId,
                paymentMethod: 'cash',
                status: 'completed',
                createdAt: { $lte: sessionEnd },
                $or: sessionBranches.map((b) => ({ userId: b.userId, createdAt: { $gte: b.opening } })),
              },
            },
            { $facet: facet },
          ]);
          for (const b of sessionBranches) {
            const row = facetResult?.[b.key]?.[0];
            salesBySession.set(b.key, {
              salesCents: row?.salesCents ?? 0,
              vatCents: row?.vatCents ?? 0,
              discountCents: row?.discountCents ?? 0,
            });
          }
        }

        // Cash expenses since the earliest opening, fetched once and split per session in memory
        const cashExpenseRows = await getRepos().expenses.listCashBetween(String(tenant._id), earliestOpening, sessionEnd);

        const closings: Parameters<CashDrawerSessionRepo['closeEach']>[1] = [];
        const closed: Array<{
          session: (typeof openSessions)[number];
          cashSales: number;
          cashExpensesTotal: number;
          expectedAmount: number;
          closingAmount: number;
          shortage: number;
          overage: number;
        }> = [];

        for (const [i, session] of openSessions.entries()) {
          try {
            // Calculate expected amount
            const sessionStart = new Date(session.openingTime);
            const totals = salesBySession.get(`s${i}`) ?? { salesCents: 0, vatCents: 0, discountCents: 0 };
            const cashExpensesCents = cashExpenseRows
              .filter((e) => new Date(e.date) >= sessionStart)
              .reduce((sum, e) => sum + Math.round((e.amount || 0) * 100), 0);

            const cashSales = totals.salesCents / 100;
            const cashExpensesTotal = cashExpensesCents / 100;

            // Calculate expected amount (integer cents, like the manual close)
            const expectedAmount =
              (Math.round((session.openingAmount || 0) * 100) + totals.salesCents - cashExpensesCents) / 100;

            // For auto-closure, we'll set closing amount to expected (no physical count)
            // In production, you might want to flag these for review
            const closingAmount = expectedAmount;

            // Calculate shortage/overage (will be 0 for auto-closure, but calculated for reporting)
            const actualDifference = closingAmount - expectedAmount;
            const shortage = actualDifference < 0 ? Math.abs(actualDifference) : 0;
            const overage = actualDifference > 0 ? actualDifference : 0;

            const closing: CashDrawerClosing = {
              closingTime: sessionEnd,
              closingAmount,
              expectedAmount,
              totalVAT: totals.vatCents / 100,
              totalDiscounts: totals.discountCents / 100,
              notes: (session.notes || '') + (session.notes ? '\n' : '') + '[AUTO] Automatically closed at end of business day.',
            };
            if (shortage > 0) closing.shortage = shortage;
            if (overage > 0) closing.overage = overage;

            // Per-session computed values -> one batch per tenant. closeEach
            // skips a drawer closed manually meanwhile.
            closings.push({ id: session._id, closing });
            closed.push({ session, cashSales, cashExpensesTotal, expectedAmount, closingAmount, shortage, overage });
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            totalFailed++;
            results.errors?.push(`Session ${session._id}: ${error.message}`);
          }
        }

        if (closings.length === 0) continue;

        // Update sessions
        await cashDrawerSessions.closeEach(tenantId, closings);
        totalProcessed += closed.length;

        for (const { session, cashSales, cashExpensesTotal, expectedAmount, closingAmount, shortage, overage } of closed) {
          try {
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
          } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            results.errors?.push(`Session ${session._id} notification: ${error.message}`);
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
