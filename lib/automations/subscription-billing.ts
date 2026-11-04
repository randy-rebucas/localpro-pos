/**
 * Subscription Billing Lifecycle Automation
 *
 * Anchored on each subscription's nextBillingDate (the due date):
 *   -3d       generate the billing invoice
 *    0d       if unpaid, start a 7-day grace period
 *  +7 to +10d still unpaid -> reminder to settle the invoice or contact support
 *   +10d      still unpaid -> deactivate the tenant account
 *   +15d      still unpaid -> apply a 10% late charge
 *   +30d      still unpaid -> apply the plan's flat reactivation fee
 */

import { getRepos, type SubscriptionPlan } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/receipt';
import { sendEmail } from '@/lib/notifications';
import { getTenantSettingsById } from '@/lib/tenant';
import { DEFAULT_NOTIFICATION_TEMPLATES, renderNotificationTemplate } from '@/lib/notification-templates';
import { logger } from '@/lib/logger';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE_PERIOD_DAYS = 7;
const DEACTIVATION_BUFFER_DAYS = 3; // deactivate 3 days after grace period ends (10 days total past due)
const LATE_FEE_DAYS = 15;
const LATE_FEE_PERCENT = 0.10;
const REACTIVATION_FEE_DAYS = 30;
const BILLING_ADMIN_EMAIL = process.env.BILLING_ADMIN_EMAIL || 'admin@localpro.asia';

export interface SubscriptionBillingResult {
  success: boolean;
  message: string;
  processed: number;
  failed: number;
  details: {
    invoicesGenerated: number;
    overdueFlagged: number;
    remindersSent: number;
    accountsDeactivated: number;
    lateFeesApplied: number;
    reactivationFeesApplied: number;
  };
  errors: string[];
}

interface BillingOptions {
  tenantId?: string;
}

async function notifyTenant(
  tenantId: string,
  companyName: string,
  templateKey: 'email_invoice_generated' | 'email_payment_reminder' | 'email_payment_overdue_final_notice' | 'email_account_deactivated',
  variables: Record<string, string | number>
): Promise<void> {
  const settings = await getTenantSettingsById(tenantId);
  const recipientEmail = settings?.email;
  if (!recipientEmail || settings?.emailNotifications === false) return;

  const template = DEFAULT_NOTIFICATION_TEMPLATES[templateKey];
  if (!template) return;

  const subject = renderNotificationTemplate(template.subject || '', { ...variables, companyName }, settings);
  const body = renderNotificationTemplate(template.body, { ...variables, companyName }, settings);

  await sendEmail({ to: recipientEmail, subject, message: body, type: 'email' });
}

/**
 * Internal ops alert to LocalPro staff for dues/unpaid bills — separate from
 * the tenant-facing notifyTenant() above, plain text, not template-driven.
 */
async function notifyAdmin(subject: string, message: string): Promise<void> {
  await sendEmail({ to: BILLING_ADMIN_EMAIL, subject, message, type: 'email' });
}

export async function processSubscriptionBilling(
  options?: BillingOptions
): Promise<SubscriptionBillingResult> {
  const { subscriptions, subscriptionPlans, billingEvents, invoices } = getRepos();

  const now = new Date();
  const errors: string[] = [];
  const details = {
    invoicesGenerated: 0,
    overdueFlagged: 0,
    remindersSent: 0,
    accountsDeactivated: 0,
    lateFeesApplied: 0,
    reactivationFeesApplied: 0,
  };

  const tenantFilter = options?.tenantId ? { tenantId: options.tenantId } : {};

  const plans = await subscriptionPlans.list();
  const planMap = new Map<string, SubscriptionPlan>(plans.map((p) => [p._id, p]));

  try {
    // 1. Generate invoice 3 days before due date
    const upcomingDue = new Date(now.getTime() + 3 * DAY_MS);
    const dueSoonSubs = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      status: 'active',
      autoRenew: true,
      nextBillingDate: { lte: upcomingDue, gte: now },
    });

    for (const sub of dueSoonSubs) {
      try {
        const cycleStart = new Date(sub.nextBillingDate!.getTime() - 3 * DAY_MS);
        if (sub.lastInvoiceGeneratedAt && sub.lastInvoiceGeneratedAt >= cycleStart) {
          continue; // already generated for this billing cycle
        }

        const plan = planMap.get(sub.planId);
        if (!plan) continue;

        const tenantId = sub.tenantId;
        const tenant = await getRepos().tenants.findById(tenantId, { select: 'name' });
        const invoiceNumber = await generateInvoiceNumber(tenantId);
        const amount = plan.price.monthly;

        const invoice = await invoices.create(tenantId, {
          invoiceNumber,
          items: [{ name: `${plan.name} subscription`, quantity: 1, price: amount, subtotal: amount }],
          subtotal: amount,
          taxAmount: 0,
          total: amount,
          dueDate: sub.nextBillingDate!,
          paymentTerms: 'Due on receipt',
          status: 'sent',
          notes: 'Auto-generated subscription billing invoice',
        });

        await billingEvents.create(tenantId, {
          subscriptionId: sub._id,
          type: 'invoice_generated',
          amount,
          currency: plan.price.currency || 'PHP',
          description: `Invoice ${invoiceNumber} generated for upcoming billing`,
          invoiceUrl: `/invoices/${invoice._id}`,
        });

        await subscriptions.update(tenantId, sub._id, { set: { lastInvoiceGeneratedAt: now } });

        await notifyTenant(tenantId, tenant?.name || 'your business', 'email_invoice_generated', {
          invoiceNumber,
          amount,
          dueDate: sub.nextBillingDate!.toDateString(),
        });

        details.invoicesGenerated++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Invoice generation for subscription ${sub._id}: ${msg}`);
      }
    }

    // 2. Flag overdue + start grace period (due date passed, unpaid)
    const overdueSubs = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      status: 'active',
      autoRenew: true,
      nextBillingDate: { lte: now },
      paymentOverdue: false,
    });

    for (const sub of overdueSubs) {
      try {
        sub.paymentOverdue = true;
        sub.gracePeriodEndDate = new Date(sub.nextBillingDate!.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
        await subscriptions.update(sub.tenantId, sub._id, {
          set: { paymentOverdue: true, gracePeriodEndDate: sub.gracePeriodEndDate },
        });

        const plan = planMap.get(sub.planId);
        await billingEvents.create(sub.tenantId, {
          subscriptionId: sub._id,
          type: 'payment_overdue',
          amount: plan?.price.monthly || 0,
          currency: plan?.price.currency || 'PHP',
          description: `Payment overdue, grace period until ${sub.gracePeriodEndDate.toDateString()}`,
        });

        const tenant = await getRepos().tenants.findById(sub.tenantId, { select: 'name' });
        await notifyTenant(sub.tenantId, tenant?.name || 'your business', 'email_payment_reminder', {
          invoiceNumber: `SUB-${String(sub._id).slice(-8).toUpperCase()}`,
          amount: plan?.price.monthly || 0,
          dueDate: sub.nextBillingDate!.toDateString(),
          gracePeriodEndDate: sub.gracePeriodEndDate.toDateString(),
        });

        try {
          await notifyAdmin(
            `[Billing] Payment overdue: ${tenant?.name || sub.tenantId}`,
            `Tenant: ${tenant?.name || sub.tenantId} (${sub.tenantId})\nSubscription: ${sub._id}\nAmount due: ${plan?.price.monthly || 0} ${plan?.price.currency || 'PHP'}\nDue date: ${sub.nextBillingDate!.toDateString()}\nGrace period ends: ${sub.gracePeriodEndDate.toDateString()}`
          );
        } catch (adminError) {
          const adminMsg = adminError instanceof Error ? adminError.message : String(adminError);
          errors.push(`Admin notify (overdue) for subscription ${sub._id}: ${adminMsg}`);
        }

        details.overdueFlagged++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Overdue flagging for subscription ${sub._id}: ${msg}`);
      }
    }

    // 3. Redirect/reminder window: grace period passed but not yet at deactivation threshold
    const reminderWindowStart = new Date(now.getTime() - DEACTIVATION_BUFFER_DAYS * DAY_MS);
    const remindSubs = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      status: 'active',
      paymentOverdue: true,
      gracePeriodEndDate: { lte: now, gte: reminderWindowStart },
      unset: ['deactivatedAt'],
    });

    for (const sub of remindSubs) {
      try {
        const plan = planMap.get(sub.planId);
        const tenant = await getRepos().tenants.findById(sub.tenantId, { select: 'name' });
        const deactivationDate = new Date(sub.gracePeriodEndDate!.getTime() + DEACTIVATION_BUFFER_DAYS * DAY_MS);

        await notifyTenant(sub.tenantId, tenant?.name || 'your business', 'email_payment_overdue_final_notice', {
          invoiceNumber: `SUB-${String(sub._id).slice(-8).toUpperCase()}`,
          amount: plan?.price.monthly || 0,
          deactivationDate: deactivationDate.toDateString(),
        });

        try {
          await notifyAdmin(
            `[Billing] Final notice sent: ${tenant?.name || sub.tenantId}`,
            `Tenant: ${tenant?.name || sub.tenantId} (${sub.tenantId})\nSubscription: ${sub._id}\nAmount due: ${plan?.price.monthly || 0} ${plan?.price.currency || 'PHP'}\nAccount will be deactivated on: ${deactivationDate.toDateString()}`
          );
        } catch (adminError) {
          const adminMsg = adminError instanceof Error ? adminError.message : String(adminError);
          errors.push(`Admin notify (reminder) for subscription ${sub._id}: ${adminMsg}`);
        }

        details.remindersSent++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Reminder for subscription ${sub._id}: ${msg}`);
      }
    }

    // 4. Deactivate accounts still unpaid after grace period + buffer (10 days past due)
    const deactivationCutoff = new Date(now.getTime() - DEACTIVATION_BUFFER_DAYS * DAY_MS);
    const toDeactivate = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      status: 'active',
      paymentOverdue: true,
      gracePeriodEndDate: { lte: deactivationCutoff },
      unset: ['deactivatedAt'],
    });

    for (const sub of toDeactivate) {
      try {
        await subscriptions.update(sub.tenantId, sub._id, {
          set: { status: 'suspended', suspendedAt: now, deactivatedAt: now },
        });

        await getRepos().tenants.update(sub.tenantId, { set: { isActive: false } });

        const plan = planMap.get(sub.planId);
        await billingEvents.create(sub.tenantId, {
          subscriptionId: sub._id,
          type: 'account_deactivated',
          amount: plan?.price.monthly || 0,
          currency: plan?.price.currency || 'PHP',
          description: 'Account deactivated after 10 days of non-payment',
        });

        const tenant = await getRepos().tenants.findById(sub.tenantId, { select: 'name' });
        await notifyTenant(sub.tenantId, tenant?.name || 'your business', 'email_account_deactivated', {
          invoiceNumber: `SUB-${String(sub._id).slice(-8).toUpperCase()}`,
          amount: plan?.price.monthly || 0,
        });

        try {
          await notifyAdmin(
            `[Billing] Account deactivated: ${tenant?.name || sub.tenantId}`,
            `Tenant: ${tenant?.name || sub.tenantId} (${sub.tenantId})\nSubscription: ${sub._id}\nAmount due: ${plan?.price.monthly || 0} ${plan?.price.currency || 'PHP'}\nDeactivated after 10 days of non-payment.`
          );
        } catch (adminError) {
          const adminMsg = adminError instanceof Error ? adminError.message : String(adminError);
          errors.push(`Admin notify (deactivation) for subscription ${sub._id}: ${adminMsg}`);
        }

        details.accountsDeactivated++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Deactivation for subscription ${sub._id}: ${msg}`);
      }
    }

    // 5. Late fee (15 days past due)
    const lateFeeCutoff = new Date(now.getTime() - LATE_FEE_DAYS * DAY_MS);
    const toLateFee = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      paymentOverdue: true,
      nextBillingDate: { lte: lateFeeCutoff },
      unset: ['lateFeeAppliedAt'],
    });

    for (const sub of toLateFee) {
      try {
        const plan = planMap.get(sub.planId);
        if (!plan) continue;

        const lateFeeAmount = plan.price.monthly * LATE_FEE_PERCENT;
        sub.outstandingBalance = (sub.outstandingBalance || 0) + lateFeeAmount;
        await subscriptions.update(sub.tenantId, sub._id, {
          set: { outstandingBalance: sub.outstandingBalance, lateFeeAppliedAt: now },
          addBillingEntry: {
            date: now,
            amount: lateFeeAmount,
            currency: plan.price.currency || 'PHP',
            status: 'pending',
          },
        });

        await billingEvents.create(sub.tenantId, {
          subscriptionId: sub._id,
          type: 'late_fee_applied',
          amount: lateFeeAmount,
          currency: plan.price.currency || 'PHP',
          description: `10% late charge applied after ${LATE_FEE_DAYS} days of non-payment`,
        });

        try {
          const tenant = await getRepos().tenants.findById(sub.tenantId, { select: 'name' });
          await notifyAdmin(
            `[Billing] Late fee applied: ${tenant?.name || sub.tenantId}`,
            `Tenant: ${tenant?.name || sub.tenantId} (${sub.tenantId})\nSubscription: ${sub._id}\nLate fee: ${lateFeeAmount} ${plan.price.currency || 'PHP'}\nOutstanding balance: ${sub.outstandingBalance} ${plan.price.currency || 'PHP'}`
          );
        } catch (adminError) {
          const adminMsg = adminError instanceof Error ? adminError.message : String(adminError);
          errors.push(`Admin notify (late fee) for subscription ${sub._id}: ${adminMsg}`);
        }

        details.lateFeesApplied++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Late fee for subscription ${sub._id}: ${msg}`);
      }
    }

    // 6. Reactivation fee (30 days past due)
    const reactivationCutoff = new Date(now.getTime() - REACTIVATION_FEE_DAYS * DAY_MS);
    const toReactivationFee = await subscriptions.findAcrossTenants({
      ...tenantFilter,
      paymentOverdue: true,
      nextBillingDate: { lte: reactivationCutoff },
      unset: ['reactivationFeeAppliedAt'],
    });

    for (const sub of toReactivationFee) {
      try {
        const plan = planMap.get(sub.planId);
        if (!plan) continue;

        const fee = plan.reactivationFee || 0;
        sub.outstandingBalance = (sub.outstandingBalance || 0) + fee;
        await subscriptions.update(sub.tenantId, sub._id, {
          set: { outstandingBalance: sub.outstandingBalance, reactivationFeeAppliedAt: now },
        });

        await billingEvents.create(sub.tenantId, {
          subscriptionId: sub._id,
          type: 'reactivation_fee_applied',
          amount: fee,
          currency: plan.price.currency || 'PHP',
          description: `Reactivation fee applied after ${REACTIVATION_FEE_DAYS} days of non-payment`,
        });

        try {
          const tenant = await getRepos().tenants.findById(sub.tenantId, { select: 'name' });
          await notifyAdmin(
            `[Billing] Reactivation fee applied: ${tenant?.name || sub.tenantId}`,

            `Tenant: ${tenant?.name || sub.tenantId} (${sub.tenantId})\nSubscription: ${sub._id}\nReactivation fee: ${fee} ${plan.price.currency || 'PHP'}\nOutstanding balance: ${sub.outstandingBalance} ${plan.price.currency || 'PHP'}`
          );
        } catch (adminError) {
          const adminMsg = adminError instanceof Error ? adminError.message : String(adminError);
          errors.push(`Admin notify (reactivation fee) for subscription ${sub._id}: ${adminMsg}`);
        }

        details.reactivationFeesApplied++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Reactivation fee for subscription ${sub._id}: ${msg}`);
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(msg);
    logger.error('Subscription billing automation error', error);
  }

  const processed =
    details.invoicesGenerated +
    details.overdueFlagged +
    details.remindersSent +
    details.accountsDeactivated +
    details.lateFeesApplied +
    details.reactivationFeesApplied;

  return {
    success: errors.length === 0,
    message:
      processed > 0
        ? `Processed ${processed} billing action(s): ${details.invoicesGenerated} invoices, ${details.overdueFlagged} flagged overdue, ${details.remindersSent} reminders, ${details.accountsDeactivated} deactivated, ${details.lateFeesApplied} late fees, ${details.reactivationFeesApplied} reactivation fees`
        : 'No billing actions to process',
    processed,
    failed: errors.length,
    details,
    errors,
  };
}
