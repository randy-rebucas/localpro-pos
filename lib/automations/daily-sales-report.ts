/**
 * Daily sales report for the business owner, by email and/or SMS, built from the
 * day's Z-Reading so the owner sees the same figures as the official record.
 */
import ZReading from '@/models/ZReading';
import type { ITenantSettings } from '@/models/Tenant';
import { getSalesReport } from '@/lib/analytics';
import { formatCurrency, formatNumber, getDefaultTenantSettings } from '@/lib/currency';
import { logger } from '@/lib/logger';
import { sendEmail, sendSMS } from '@/lib/notifications';
import type { ActiveTenant } from '@/lib/tenant-active-query';
import { getTenantDayBoundaries } from '@/lib/timezone';
import type { ZReadingResult } from '@/lib/z-reading';

export const DAILY_REPORT_TENANT_FIELDS =
  'dailyReport settings.emailNotifications settings.email settings.companyName settings.currency settings.currencySymbol settings.currencyPosition settings.numberFormat';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sends the report once per reading. Returns the channels that failed while another got through. */
export async function sendDailySalesReport(
  tenant: ActiveTenant,
  reading: ZReadingResult['reading'],
  businessDate: Date,
  timezone: string
): Promise<string[]> {
  const stored = (tenant.settings ?? {}) as Partial<ITenantSettings>;
  const recipients = tenant.dailyReport as { email?: string; phone?: string } | undefined;

  // Stores already getting the report at their business email keep getting it there
  const email = recipients?.email || (stored.emailNotifications ? stored.email : undefined);
  const phone = recipients?.phone;
  if (!email && !phone) return [];

  // Claimed before sending, so overlapping runs can't both reach the owner
  const claim = await ZReading.updateOne(
    { _id: reading._id, tenantId: tenant._id, ownerReportSentAt: { $exists: false } },
    { $set: { ownerReportSentAt: new Date() } }
  );
  if (claim.modifiedCount === 0) return [];

  const settings = { ...getDefaultTenantSettings(), ...stored };
  const companyName = stored.companyName || tenant.name;
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(businessDate);

  const [emailSent, smsSent] = await Promise.all([
    email
      ? buildEmail(tenant, reading, businessDate, timezone, settings, companyName, dateLabel).then((message) =>
        sendEmail({ to: email, subject: `Daily Sales Report - ${companyName} - ${dateLabel}`, message, type: 'email', html: true })
      )
      : undefined,
    phone
      ? sendSMS({ to: phone, message: buildSms(reading, settings, companyName, dateLabel), type: 'sms' })
      : undefined,
  ]);

  if (!emailSent && !smsSent) {
    // Nothing reached the owner, so let the next hourly run try again
    await ZReading.updateOne({ _id: reading._id, tenantId: tenant._id }, { $unset: { ownerReportSentAt: 1 } });
    throw new Error('daily report could not be delivered');
  }

  return [...(emailSent === false ? ['email'] : []), ...(smsSent === false ? ['SMS'] : [])];
}

/** Plain ASCII, as a peso sign would cut a text to 70 characters per billed part. */
function buildSms(
  reading: ZReadingResult['reading'],
  settings: ITenantSettings,
  companyName: string,
  dateLabel: string
): string {
  const money = (amount: number) => `${settings.currency} ${formatNumber(amount, settings.numberFormat)}`;
  return `${companyName} sales ${dateLabel}: Gross ${money(reading.grossSales)}, Refunds ${money(reading.refundTotal)}, Net ${money(reading.netSales)}, ${reading.transactionCount} txns`;
}

async function buildEmail(
  tenant: ActiveTenant,
  reading: ZReadingResult['reading'],
  businessDate: Date,
  timezone: string,
  settings: ITenantSettings,
  companyName: string,
  dateLabel: string
): Promise<string> {
  const money = (amount: number) => escapeHtml(formatCurrency(amount, settings));
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd;">${label}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;">${value}</td></tr>`;

  // The owner still needs the day's totals if this breakdown can't be worked out
  const { end } = getTenantDayBoundaries(businessDate, timezone);
  const sales = await getSalesReport(tenant._id.toString(), 'daily', businessDate, end, timezone).catch((error: unknown) => {
    logger.error(`Payment breakdown failed for tenant ${tenant.slug}:`, error);
    return null;
  });
  const byMethod = sales?.salesByPaymentMethod;
  const paymentRows = byMethod
    ? row('Cash', money(byMethod.cash)) + row('Card', money(byMethod.card)) + row('Digital', money(byMethod.digital)) + row('On account', money(byMethod.on_account))
    : '';

  // On one line, as sendEmail turns line breaks into <br>
  return [
    '<div style="font-family:Arial,sans-serif;color:#333;max-width:560px;margin:0 auto;padding:20px;">',
    `<h2 style="margin:0;">Daily Sales Report</h2>`,
    `<p style="margin:4px 0 20px;">${escapeHtml(companyName)} &middot; ${dateLabel}</p>`,
    '<table style="width:100%;border-collapse:collapse;">',
    row('<strong>Gross sales</strong>', `<strong>${money(reading.grossSales)}</strong>`),
    row('Refunds paid', money(reading.refundTotal)),
    row('<strong>Net sales</strong>', `<strong>${money(reading.netSales)}</strong>`),
    row('Discounts', money(reading.discountTotal)),
    row('VAT', money(reading.vatAmount)),
    row('Transactions', String(reading.transactionCount)),
    row('Voids', String(reading.voidCount)),
    '</table>',
    paymentRows
      ? `<h3 style="margin:24px 0 4px;">Sales by payment method, after refunds</h3><table style="width:100%;border-collapse:collapse;">${paymentRows}</table>`
      : '',
    '<p style="margin-top:24px;font-size:12px;color:#666;">Figures are from this day\'s Z-Reading.</p>',
    '</div>',
  ].join('');
}
