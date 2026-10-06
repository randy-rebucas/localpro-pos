'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscriptionManager } from '@/hooks/useSubscriptionManager';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import {
  formatDate,
  getSubscriptionStatusBadgeStyles,
  getSubscriptionStatusLabel,
  getBillingTransactionStatusBadgeStyles,
  getBillingTransactionStatusLabel,
} from '@/lib/subscriptions-helpers';

type Tab = 'subscription' | 'billing';

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;

function UsageCard({ label, used, limit, valueClass, dict }: {
  label: string;
  used: number;
  limit: number | undefined;
  valueClass: string;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const unlimited = limit === -1 || limit === undefined;
  const pct = !unlimited && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? 'bg-win8-danger' : pct >= 75 ? 'bg-win8-warning' : 'bg-brand';
  return (
    <div className="bg-white border border-gray-300 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
      <p className={`text-3xl font-bold tabular-nums mt-1.5 ${valueClass}`}>{used.toLocaleString()}</p>
      <p className="text-xs text-gray-400 mt-1 tabular-nums">
        {unlimited
          ? (dict?.admin?.unlimited || 'Unlimited')
          : (dict?.admin?.ofLimit || 'of {limit}').replace('{limit}', limit.toLocaleString())}
      </p>
      {!unlimited && (
        <div className="mt-3 bg-gray-100 h-1.5 overflow-hidden" aria-hidden="true">
          <div className={`h-1.5 ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function SubscriptionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';

  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [activeTab, setActiveTab] = useState<Tab>('subscription');
  const { subscription, billingHistory, loading, billingLoading, error, billingError, fetchSubscription, fetchBillingHistory } = useSubscriptionManager();
  const { canAccess } = usePermissions();
  const canManage = canAccess('subscriptions.view');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSubscription();
    fetchBillingHistory();
  }, [lang, fetchSubscription, fetchBillingHistory]);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const header = (
    <AdminPageHeader
      title={dict.admin?.subscriptions || 'My Subscription'}
      description={dict.admin?.subscriptionDescription || 'Manage your subscription, billing, and plans'}
    />
  );

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="bg-white border border-win8-danger p-4">
          <h2 className="text-sm font-bold text-win8-danger">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700 mt-1">
            {dict.admin?.accessRestrictedSubscriptions || "You don't have permission to manage subscriptions. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const plansHref = `/${tenant}/${lang}/subscription`;
  const plan = subscription?.planId;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'subscription', label: dict.admin?.currentSubscription || 'Current Subscription' },
    { id: 'billing', label: dict.admin?.billingHistory || 'Billing History' },
  ];

  const birItems: { key: keyof NonNullable<NonNullable<typeof plan>['birCompliance']>; label: string }[] = [
    { key: 'auditTrailSystem', label: dict.admin?.birAuditTrail || 'Audit Trail System' },
    { key: 'ptuAssistance', label: dict.admin?.birPtuAssistance || 'PTU Assistance' },
    { key: 'receiptFormatting', label: dict.admin?.birReceiptFormatting || 'BIR Receipt Formatting' },
    { key: 'birDocumentation', label: dict.admin?.birDocumentation || 'BIR Documentation' },
    { key: 'casReporting', label: dict.admin?.birCasReporting || 'CAS-Ready Reporting' },
    { key: 'monthlySupport', label: dict.admin?.birMonthlySupport || 'Monthly Compliance Support' },
  ];

  return (
    <div className="px-4 sm:px-6 py-6">
      {header}

      <div className="space-y-4">
        {/* Tabs */}
        <div role="tablist" aria-label={dict.admin?.subscriptionTabs || 'Subscription sections'} className="flex flex-wrap border border-gray-300 bg-white w-fit">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab: Subscription */}
        {activeTab === 'subscription' && (
          loading ? (
            <div className="text-center py-12 bg-white border border-gray-300">
              {SPINNER}
              <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingSubscription || 'Loading subscription…'}</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white border border-gray-300">
              <p className="text-sm font-bold text-gray-900">{dict.admin?.failedToLoadSubscription || 'Failed to Load Subscription'}</p>
              <p className="text-win8-danger text-sm font-medium mt-1">{error}</p>
              <button
                onClick={() => fetchSubscription()}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
              >
                {dict.common?.retry || 'Retry'}
              </button>
            </div>
          ) : subscription ? (
            <div className="space-y-6">
              {/* Plan summary */}
              <section className="bg-white border border-gray-300">
                <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {dict.admin?.currentSubscription || 'Current Subscription'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <h2 className="text-base font-bold text-gray-900">{plan?.name || '—'}</h2>
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getSubscriptionStatusBadgeStyles(subscription.status)}`}>
                        {getSubscriptionStatusLabel(subscription.status, dict)}
                      </span>
                    </div>
                    {plan?.price?.monthly ? (
                      <p className="text-sm text-gray-500 tabular-nums">
                        {plan.price.currency} {plan.price.monthly.toLocaleString()}/mo
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={plansHref}
                    className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                  >
                    {dict.admin?.upgradePlan || 'Upgrade Plan'}
                  </Link>
                </div>
                <dl className="p-6 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">{dict.admin?.billingCycle || 'Billing Cycle'}</dt>
                    <dd className="text-sm font-medium text-gray-900 capitalize mt-0.5">{subscription.billingCycle || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">{dict.admin?.startDate || 'Start Date'}</dt>
                    <dd className="text-sm font-medium text-gray-900 mt-0.5">{formatDate(subscription.startDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">
                      {subscription.isTrial ? (dict.admin?.trialEndDate || 'Trial Ends') : (dict.admin?.nextBillingDate || 'Next Billing')}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900 mt-0.5">
                      {formatDate(subscription.isTrial ? subscription.trialEndDate : subscription.nextBillingDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">{dict.admin?.autoRenew || 'Auto-Renew'}</dt>
                    <dd className={`text-sm font-semibold mt-0.5 ${subscription.autoRenew ? 'text-win8-success' : 'text-gray-500'}`}>
                      {subscription.autoRenew ? (dict.admin?.autoRenewOn || 'On') : (dict.admin?.autoRenewOff || 'Off')}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Usage */}
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-3">{dict.admin?.planUsage || 'Plan Usage'}</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <UsageCard label={dict.admin?.users || 'Users'} used={subscription.usage.currentUsers} limit={plan?.features?.maxUsers} valueClass="text-brand" dict={dict} />
                  <UsageCard label={dict.admin?.branches || 'Branches'} used={subscription.usage.currentBranches} limit={plan?.features?.maxBranches} valueClass="text-win8-success" dict={dict} />
                  <UsageCard label={dict.admin?.products || 'Products'} used={subscription.usage.currentProducts} limit={plan?.features?.maxProducts} valueClass="text-win8-info" dict={dict} />
                  <UsageCard label={dict.admin?.transactions || 'Transactions'} used={subscription.usage.currentTransactions} limit={plan?.features?.maxTransactions} valueClass="text-win8-accent" dict={dict} />
                </div>
              </div>

              {/* BIR Compliance Features */}
              {plan?.birCompliance && (
                <section className="bg-white border border-gray-300 p-5">
                  <h2 className="text-sm font-bold text-gray-900 mb-4">{dict.admin?.birComplianceIncluded || 'BIR Compliance Included'}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6">
                    {birItems.filter(({ key }) => plan.birCompliance?.[key]).map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-2 h-2 shrink-0 bg-win8-success" aria-hidden="true" />
                        <span className="text-xs text-gray-700">{label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy flex items-center justify-between gap-3 flex-wrap">
                <span>{dict.admin?.upgradePlanHint || 'Need to upgrade or modify your plan?'}</span>
                <Link href={plansHref} className="font-semibold text-brand hover:underline inline-flex items-center">
                  {dict.admin?.viewPlans || 'View Plans'} →
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-gray-300">
              <p className="text-sm font-bold text-gray-900">{dict.admin?.noSubscription || 'No Active Subscription'}</p>
              <p className="text-sm text-gray-400 mt-1">
                {dict.admin?.noSubscriptionHint || "You don't have an active subscription. Contact support to get started."}
              </p>
              <Link
                href={plansHref}
                className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                {dict.admin?.viewPlans || 'View Plans'}
              </Link>
            </div>
          )
        )}

        {/* Tab: Billing History */}
        {activeTab === 'billing' && (
          <section className="bg-white border border-gray-300">
            <div className="px-6 py-4 border-b border-gray-300 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-gray-900">{dict.admin?.billingHistory || 'Billing History'}</h2>
              <button
                onClick={fetchBillingHistory}
                disabled={billingLoading}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {billingLoading ? (dict.common?.loading || 'Loading…') : (dict.admin?.refresh || 'Refresh')}
              </button>
            </div>

            {billingLoading && billingHistory.length === 0 ? (
              <div className="text-center py-12">
                {SPINNER}
                <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingBillingHistory || 'Loading billing history…'}</p>
              </div>
            ) : billingError ? (
              <div className="text-center py-12">
                <p className="text-win8-danger text-sm font-medium">{billingError}</p>
                <button
                  onClick={() => fetchBillingHistory()}
                  className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
                >
                  {dict.common?.retry || 'Retry'}
                </button>
              </div>
            ) : billingHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                {dict.admin?.noBillingHistory || 'No billing history available'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{dict.admin?.date || 'Date'}</th>
                      <th className="px-4 py-3 text-right font-medium">{dict.admin?.amount || 'Amount'}</th>
                      <th className="px-4 py-3 text-left font-medium">{dict.admin?.transactionId || 'Transaction ID'}</th>
                      <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                      <th className="px-4 py-3 text-right font-medium">{dict.admin?.invoice || 'Invoice'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {billingHistory.map((transaction) => (
                      <tr key={transaction._id} className="hover:bg-gray-100 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-700">{formatDate(transaction.date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                          {transaction.currency} {Number(transaction.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">{transaction.transactionId || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-semibold ${getBillingTransactionStatusBadgeStyles(transaction.status)}`}>
                            {getBillingTransactionStatusLabel(transaction.status, dict)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {transaction.invoiceUrl && /^https?:\/\//i.test(transaction.invoiceUrl) ? (
                            <a
                              href={transaction.invoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-end text-brand hover:underline"
                            >
                              {dict.admin?.viewInvoice || 'View'}
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
