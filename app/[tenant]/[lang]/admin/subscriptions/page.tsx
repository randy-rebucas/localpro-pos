'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUp, Check, ExternalLink, Receipt, RefreshCw } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_KEY, KEY, KEY_PRIMARY,
  LedReadout, RegisterPage, Strip,
} from '@/components/admin/register-ui';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscriptionManager, type Subscription } from '@/hooks/useSubscriptionManager';
import {
  daysUntil, formatDate, formatMoney, getBillingStatusLabel, getSubscriptionStatusLabel,
} from '@/lib/subscriptions-helpers';

/** Status tags, the colour a till would print them in. */
const STATUS_TAG: Record<string, string> = {
  active: 'bg-brand text-ink',
  trial: 'bg-[#8fe3d0] text-ink',
  paused: 'bg-ink/10 text-ink',
  inactive: 'bg-ink/10 text-ink',
  suspended: 'bg-stamp text-paper-white',
  cancelled: 'bg-stamp text-paper-white',
};
const BILL_TAG: Record<string, string> = {
  paid: 'bg-brand text-ink',
  pending: 'bg-ink/10 text-ink',
  failed: 'bg-stamp text-paper-white',
  refunded: 'bg-ink/10 text-ink',
};

const TAG = 'inline-flex items-center px-2 py-0.5 font-receipt text-[11px] font-medium uppercase tracking-[0.08em]';

type UsageKey = 'Users' | 'Branches' | 'Products' | 'Transactions';

export default function SubscriptionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { subscription, billingHistory, loading, billingLoading, error, billingError, fetchSubscription, fetchBillingHistory } = useSubscriptionManager();
  const { settings } = useTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('subscriptions.manage');
  const timeZone = settings?.timezone || 'Asia/Manila';
  const locale = lang === 'es' ? 'es' : 'en-PH';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    // Both endpoints need subscriptions.manage; without it there is nothing to show.
    if (!canManage) return;
    fetchSubscription();
    fetchBillingHistory();
  }, [canManage, fetchSubscription, fetchBillingHistory]);

  const t = (key: string, fallback: string) => dict?.admin?.[key] || fallback;
  const title = t('subscriptions', 'Subscriptions');

  if (!dict || (canManage && loading)) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <RegisterPage tagNo="SB" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{t('accessRestricted', 'Access Restricted')}</h2>
            <p className="mt-2 text-sm">
              {t('accessRestrictedSubscriptions', "You don't have permission to manage subscriptions. Contact an admin or owner.")}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const date = (v?: string | null) => formatDate(v, timeZone, locale);
  const upgradeHref = `/${tenant}/${lang}/subscription`;

  // The display counts down to whatever happens next: the trial ending, or the next bill.
  const countdown = subscription
    ? subscription.status === 'trial' && subscription.trialEndDate
      ? { days: daysUntil(subscription.trialEndDate), label: t('trialDaysLeft', 'Trial days left') }
      : subscription.nextBillingDate
        ? { days: daysUntil(subscription.nextBillingDate), label: t('daysToNextBill', 'Days to next bill') }
        : null
    : null;

  return (
    <RegisterPage
      tagNo="SB"
      tag={settings?.companyName}
      title={title}
      subtitle={t('subscriptionDescription', 'View your current subscription and billing history')}
      side={countdown && countdown.days !== null ? <LedReadout value={countdown.days} label={countdown.label} /> : undefined}
    >
      {error ? (
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink" role="alert">
            <h2 className="text-3xl">{t('failedToLoadSubscription', 'Failed to Load Subscription')}</h2>
            <p className="mt-2 font-receipt text-sm text-ink/70">{error}</p>
            <button type="button" onClick={() => fetchSubscription()} className={`${KEY_PRIMARY} mt-4`}>
              <RefreshCw className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.common?.retry || 'Retry'}
            </button>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      ) : subscription ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Statement subscription={subscription} dict={dict} date={date} locale={locale} upgradeHref={upgradeHref} />
          <UsageSlip subscription={subscription} dict={dict} />
        </div>
      ) : (
        <section className="mt-6 max-w-2xl">
          <div className="bg-paper-white px-5 py-6 text-ink">
            <h2 className="text-3xl">{t('noSubscription', 'No Active Subscription')}</h2>
            <p className="mt-2 text-sm text-ink/70">{t('noSubscriptionHint', 'This store has no subscription yet. Pick a plan to get started.')}</p>
            <Link href={upgradeHref} className={`${KEY_PRIMARY} mt-4 inline-flex`}>{t('viewPlans', 'View Plans')}</Link>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      )}

      {/* Billing history, printed like a till roll: latest bill on top */}
      <section className="mt-10" aria-labelledby="billing-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="billing-heading" className="text-4xl text-paper-white sm:text-5xl">{t('billingHistory', 'Billing History')}</h2>
          <button type="button" onClick={() => fetchBillingHistory()} disabled={billingLoading} className={DARK_KEY}>
            <RefreshCw className={`${ICON} ${billingLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} strokeWidth={1.75} aria-hidden />
            {billingLoading ? (dict.common?.loading || 'Loading...') : t('refreshList', 'Refresh')}
          </button>
        </div>
        <div className="mt-4 max-w-3xl">
          <div className="bg-paper-white px-4 py-3 text-ink sm:px-5">
            {billingError ? (
              <div className="py-2">
                <Strip tone="error">{billingError}</Strip>
                <button type="button" onClick={() => fetchBillingHistory()} className={`${KEY} mt-3`}>{dict.common?.retry || 'Retry'}</button>
              </div>
            ) : billingHistory.length === 0 ? (
              <p className="flex items-center gap-2 py-8 font-receipt text-sm text-ink/60">
                <Receipt className="h-5 w-5 text-ink/30" strokeWidth={1.75} aria-hidden />
                {t('noBillingHistory', 'No billing history available')}
              </p>
            ) : (
              <ul className={`divide-y divide-dashed divide-ink/25 transition-opacity ${billingLoading ? 'opacity-60' : ''}`} aria-busy={billingLoading}>
                {billingHistory.map((bill) => (
                  <li key={bill._id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                      <p className="font-receipt text-sm">{date(bill.date)}</p>
                      {bill.transactionId && <p className="break-all font-receipt text-xs text-ink/50">{t('referenceShort', 'Ref')} {bill.transactionId}</p>}
                    </div>
                    <span className={`${TAG} ${BILL_TAG[bill.status] || BILL_TAG.pending}`}>{getBillingStatusLabel(bill.status, dict)}</span>
                    <span className="ml-auto text-right font-receipt text-sm font-semibold sm:ml-0 sm:w-28">{formatMoney(bill.amount, bill.currency, locale)}</span>
                    {bill.invoiceUrl && /^https?:\/\//i.test(bill.invoiceUrl) && (
                      <a href={bill.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-1 font-receipt text-xs uppercase text-brand-hover underline-offset-2 hover:underline">
                        {t('invoice', 'Invoice')}
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </div>
      </section>
    </RegisterPage>
  );
}

/** The plan as an itemized statement: what it costs, when it renews, what is included. */
function Statement({ subscription, dict, date, locale, upgradeHref }: {
  subscription: Subscription;
  dict: TranslationDict;
  date: (v?: string | null) => string;
  locale: string;
  upgradeHref: string;
}) {
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const plan = subscription.planId;
  const currency = plan?.price?.currency;
  const bir = plan?.birCompliance;
  const birItems: [boolean | undefined, string][] = bir ? [
    [bir.auditTrailSystem, t('birAuditTrail', 'Audit Trail System')],
    [bir.ptuAssistance, t('birPtuAssistance', 'PTU Assistance')],
    [bir.receiptFormatting, t('birReceiptFormatting', 'BIR Receipt Formatting')],
    [bir.birDocumentation, t('birDocumentation', 'BIR Documentation')],
    [bir.casReporting, t('birCasReporting', 'CAS-Ready Reporting')],
    [bir.monthlySupport, t('birMonthlySupport', 'Monthly Compliance Support')],
  ] : [];
  const included = birItems.filter(([on]) => on);
  const cycle = subscription.billingCycle === 'yearly' ? t('billedYearly', 'Billed yearly') : t('billedMonthly', 'Billed monthly');
  const balance = subscription.outstandingBalance || 0;

  return (
    <section aria-labelledby="statement-heading" className="min-w-0">
      <div className="bg-paper-white px-4 py-4 text-ink sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-ink/30 pb-3">
          <div className="min-w-0">
            <p className="font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">{t('currentSubscription', 'Current Subscription')}</p>
            <h2 id="statement-heading" className="mt-1 break-words text-4xl sm:text-5xl">{plan?.name || t('plan', 'Plan')}</h2>
          </div>
          <span className={`${TAG} ${STATUS_TAG[subscription.status] || STATUS_TAG.inactive}`}>{getSubscriptionStatusLabel(subscription.status, dict)}</span>
        </div>

        <div className="space-y-1.5 py-3 font-receipt text-sm">
          {plan?.price && (
            <ReceiptRow label={t('pricePerMonth', 'Price per month')} value={formatMoney(plan.price.monthly, currency, locale)} />
          )}
          {!!plan?.price?.setupFee && (
            <ReceiptRow label={t('setupFeeOneTime', 'Setup fee (one time)')} value={formatMoney(plan.price.setupFee, currency, locale)} />
          )}
          <ReceiptRow label={t('billingCycle', 'Billing')} value={cycle} />
          <ReceiptRow label={t('startDate', 'Start Date')} value={date(subscription.startDate)} />
          {subscription.status === 'trial' && subscription.trialEndDate && (
            <ReceiptRow label={t('trialEnds', 'Trial ends')} value={date(subscription.trialEndDate)} />
          )}
          {subscription.nextBillingDate && <ReceiptRow label={t('nextBill', 'Next bill')} value={date(subscription.nextBillingDate)} />}
          {subscription.status === 'paused' && subscription.pauseEndsAt && (
            <ReceiptRow label={t('pauseEnds', 'Pause ends')} value={date(subscription.pauseEndsAt)} />
          )}
          {subscription.endDate && <ReceiptRow label={t('endDate', 'End Date')} value={date(subscription.endDate)} />}
          <ReceiptRow label={t('autoRenew', 'Renews automatically')} value={subscription.autoRenew ? t('yes', 'Yes') : t('no', 'No')} />
        </div>

        {balance > 0 && (
          <div className={`border-t border-dashed border-ink/30 py-3 font-receipt text-sm ${subscription.paymentOverdue ? 'text-stamp' : ''}`}>
            <ReceiptRow strong label={subscription.paymentOverdue ? t('balanceOverdue', 'Balance overdue') : t('balanceDue', 'Balance due')} value={formatMoney(balance, currency, locale)} />
            {subscription.paymentOverdue && subscription.gracePeriodEndDate && (
              <p className="mt-1 text-xs">{t('payBefore', 'Pay before {date} to keep the account active.').replace('{date}', date(subscription.gracePeriodEndDate))}</p>
            )}
          </div>
        )}

        {included.length > 0 && (
          <div className="border-t border-dashed border-ink/30 py-3">
            <h3 className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">{t('birComplianceIncluded', 'BIR Compliance Included')}</h3>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {included.map(([, label]) => (
                <li key={label} className="flex items-start gap-1.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-hover" strokeWidth={1.75} aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/30 pt-3">
          <p className="text-sm text-ink/70">{t('upgradePlanHint', 'Need more room or features?')}</p>
          <Link href={upgradeHref} className={`${KEY_PRIMARY} inline-flex`}>
            <ArrowUp className={ICON} strokeWidth={1.75} aria-hidden />
            {t('upgradePlan', 'Upgrade Plan')}
          </Link>
        </div>
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </section>
  );
}

/** How much of each plan limit the store is using now. */
function UsageSlip({ subscription, dict }: { subscription: Subscription; dict: TranslationDict }) {
  const t = (key: string, fallback: string) => dict.admin?.[key] || fallback;
  const features = subscription.planId?.features;
  const rows: { key: UsageKey; label: string; used: number; limit: number | undefined }[] = [
    { key: 'Users', label: t('activeUsersUsage', 'Active users'), used: subscription.usage?.currentUsers ?? 0, limit: features?.maxUsers },
    { key: 'Branches', label: t('activeBranchesUsage', 'Active branches'), used: subscription.usage?.currentBranches ?? 0, limit: features?.maxBranches },
    { key: 'Products', label: t('activeProductsUsage', 'Active products'), used: subscription.usage?.currentProducts ?? 0, limit: features?.maxProducts },
    { key: 'Transactions', label: t('transactionsThisMonth', 'Sales this month'), used: subscription.usage?.currentTransactions ?? 0, limit: features?.maxTransactions },
  ];

  return (
    <section aria-labelledby="usage-heading" className="min-w-0">
      <div className="bg-paper-white px-4 py-4 text-ink sm:px-5">
        <h2 id="usage-heading" className="border-b border-dashed border-ink/30 pb-3 text-4xl sm:text-5xl">{t('planUsage', 'Plan usage')}</h2>
        <ul className="divide-y divide-dashed divide-ink/20">
          {rows.map((row) => {
            const unlimited = row.limit === -1 || row.limit === undefined;
            const pct = unlimited || !row.limit ? 0 : Math.min(100, Math.round((row.used / row.limit) * 100));
            const near = !unlimited && pct >= 90;
            return (
              <li key={row.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{row.label}</span>
                  <span className={`font-receipt text-sm font-semibold ${near ? 'text-stamp' : ''}`}>
                    {row.used.toLocaleString()} / {unlimited ? t('unlimited', 'Unlimited') : row.limit!.toLocaleString()}
                  </span>
                </div>
                {!unlimited && (
                  <div
                    className="mt-2 h-2 bg-ink/10"
                    role="meter"
                    aria-label={row.label}
                    aria-valuemin={0}
                    aria-valuemax={row.limit}
                    aria-valuenow={Math.min(row.used, row.limit!)}
                  >
                    <div className={`h-full ${near ? 'bg-stamp' : 'bg-ink'}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="border-t border-dashed border-ink/30 pt-3 font-receipt text-xs text-ink/60">
          {t('planUsageHint', 'Counts are live. Sales are counted per calendar month.')}
        </p>
      </div>
      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
    </section>
  );
}
