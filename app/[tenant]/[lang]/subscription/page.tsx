'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import PageLoading from '@/components/ui/PageLoading';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import SubscriptionPlansSkeleton from '@/components/subscription/SubscriptionPlansSkeleton';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import type { TranslationDict } from '@/types/dictionary';
import {
  Users,
  Building,
  Package,
  CheckCircle,
  ArrowUp,
  Star,
  Zap,
  CreditCard,
  Loader2,
} from 'lucide-react';

export default function SubscriptionPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const { plans, currentPlanName, status, error, refetch } = useSubscriptionPlans();
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [upgrading, setUpgrading] = useState(false);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#35979c';

  const currentPlan = plans.find((p) => p.name === currentPlanName);
  const currentPlanId = currentPlan?._id ?? null;
  const visiblePlans = plans.filter((plan) => plan.tier !== 'enterprise');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const handleUpgrade = async (planId: string, billingCycle: 'monthly' | 'yearly' = 'monthly') => {
    const selectedPlanData = plans.find((p) => p._id === planId);
    if (!selectedPlanData) return;

    setUpgrading(true);
    try {
      const response = await fetch('/api/paypal/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ planId, billingCycle }),
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem(
          'paypal_subscription_plan',
          JSON.stringify({
            planId,
            billingCycle,
            amount: data.data.amount,
            currency: data.data.currency,
          })
        );

        const approveLink = data.data.paypalOrder.links.find(
          (link: { rel: string; href: string }) => link.rel === 'approve'
        );
        window.location.href = approveLink.href;
      } else {
        showToast.error(
          data.error || dict?.subscription?.failedToCreatePayment || 'Failed to create payment'
        );
      }
    } catch (err) {
      console.error('Error creating payment:', err);
      showToast.error(dict?.subscription?.failedToInitiatePayment || 'Failed to initiate payment');
    } finally {
      setUpgrading(false);
    }
  };

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const subDict = dict.subscription ?? {};

  const formatLimit = (value: number, label: string) =>
    value === -1 ? `${subDict.unlimited || 'Unlimited'} ${label}` : `${value} ${label}`;

  const pageHeader = (
    <div className="mb-6 sm:mb-8">
      <Link
        href={`/${tenant}/${lang}/admin/subscriptions`}
        className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {dict.common.back || 'Back'}
      </Link>
      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
        {subDict.upgradeTitle || 'Upgrade Your Subscription'}
      </h1>
      <p className="text-gray-600">
        {subDict.upgradeMessage || 'Choose a plan that fits your business needs.'}
      </p>
    </div>
  );

  if (status === 'loading') {
    return (
      <div>
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <SubscriptionPlansSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {pageHeader}
          <div className="bg-white border border-gray-300">
            <ErrorState
              title={subDict.failedToLoadPlans || 'Failed to load subscription plans'}
              description={error || undefined}
              onRetry={refetch}
              retryLabel={dict.common.retry || 'Retry'}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {pageHeader}

        {visiblePlans.length === 0 ? (
          <div className="bg-white border border-gray-300">
            <EmptyState
              icon="products"
              title={subDict.noPlansAvailable || 'No subscription plans available'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {visiblePlans.map((plan) => {
              const isCurrent = plan._id === currentPlanId;
              return (
                <div
                  key={plan._id}
                  className="flex flex-col h-full bg-white border transition-all duration-200 relative"
                  style={{
                    borderColor:
                      isCurrent ? primaryColor : selectedPlan === plan._id ? primaryColor : '#d1d5db',
                    boxShadow: isCurrent
                      ? `0 0 0 2px ${primaryColor}55`
                      : selectedPlan === plan._id
                      ? `0 0 0 2px ${primaryColor}33`
                      : undefined,
                  }}
                >
                  {isCurrent && (
                    <div
                      className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 text-xs font-semibold text-white whitespace-nowrap"
                      style={{ background: primaryColor }}
                    >
                      {subDict.currentPlan || 'Current Plan'}
                    </div>
                  )}
                  <div className="flex-1 flex flex-col p-6 justify-between">
                    <div>
                      <div className="mb-5">
                        <div
                          className="inline-flex p-3 border mb-4"
                          style={{
                            background: `${primaryColor}11`,
                            color: primaryColor,
                            borderColor: primaryColor,
                          }}
                        >
                          <CreditCard className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                        <div className="mt-1">
                          <span className="text-3xl font-bold text-gray-900">
                            {plan.price.currency} {plan.price.monthly.toLocaleString()}
                          </span>
                          <span className="text-sm text-gray-500 ml-1">
                            {subDict.perMonth || '/month'}
                          </span>
                        </div>
                        {plan.price.setupFee ? (
                          <div className="mt-1">
                            <span className="text-sm text-gray-500">
                              + {plan.price.currency} {plan.price.setupFee.toLocaleString()}{' '}
                              {subDict.oneTimeSetup || 'one-time setup'}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <ul className="space-y-2 mb-4">
                        <li className="flex items-center">
                          <Users className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                          <span className="text-sm text-gray-600">
                            {formatLimit(plan.features.maxUsers, subDict.users || 'users')}
                          </span>
                        </li>
                        <li className="flex items-center">
                          <Building className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                          <span className="text-sm text-gray-600">
                            {formatLimit(plan.features.maxBranches, subDict.branches || 'branches')}
                          </span>
                        </li>
                        <li className="flex items-center">
                          <Package className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                          <span className="text-sm text-gray-600">
                            {formatLimit(plan.features.maxProducts, subDict.products || 'products')}
                          </span>
                        </li>
                        {plan.features.enableDiscounts && (
                          <li className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-600">
                              {subDict.discountsPromotions || 'Discounts & Promotions'}
                            </span>
                          </li>
                        )}
                        {plan.features.enableMultiBranch && (
                          <li className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-600">
                              {subDict.multiBranchSupport || 'Multi-Branch Support'}
                            </span>
                          </li>
                        )}
                        {plan.features.prioritySupport && (
                          <li className="flex items-center">
                            <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                            <span className="text-sm text-gray-600">
                              {subDict.prioritySupport || 'Priority Support'}
                            </span>
                          </li>
                        )}
                      </ul>

                      {plan.birCompliance && (
                        <div className="pt-3 mb-4 border-t border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            {subDict.birCompliance || 'BIR Compliance'}
                          </p>
                          <ul className="space-y-1.5">
                            {plan.birCompliance.auditTrailSystem && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.auditTrailSystem || 'Audit Trail System'}
                                </span>
                              </li>
                            )}
                            {plan.birCompliance.ptuAssistance && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.ptuAssistance || 'PTU Assistance'}
                                </span>
                              </li>
                            )}
                            {plan.birCompliance.receiptFormatting && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.birReceiptFormatting || 'BIR Receipt Formatting'}
                                </span>
                              </li>
                            )}
                            {plan.birCompliance.birDocumentation && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.birDocumentation || 'BIR Documentation'}
                                </span>
                              </li>
                            )}
                            {plan.birCompliance.casReporting && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.casReporting || 'CAS-Ready Reporting'}
                                </span>
                              </li>
                            )}
                            {plan.birCompliance.monthlySupport && (
                              <li className="flex items-center">
                                <CheckCircle
                                  className="h-3.5 w-3.5 mr-2 flex-shrink-0"
                                  style={{ color: primaryColor }}
                                />
                                <span className="text-xs text-gray-600">
                                  {subDict.monthlyComplianceSupport || 'Monthly Compliance Support'}
                                </span>
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div>
                      {selectedPlan === plan._id ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-600 mb-1">
                            {subDict.chooseBilling || 'Choose Billing Cycle'}:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpgrade(plan._id, 'monthly')}
                              disabled={upgrading}
                              className="px-3 py-2 text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                              style={{ background: primaryColor }}
                            >
                              {upgrading ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              ) : (
                                <>
                                  <div>
                                    {plan.price.currency} {plan.price.monthly.toLocaleString()}
                                  </div>
                                  <div className="text-xs opacity-80">
                                    {subDict.monthly || 'Monthly'}
                                  </div>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpgrade(plan._id, 'yearly')}
                              disabled={upgrading}
                              className="px-3 py-2 bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                            >
                              {upgrading ? (
                                <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                              ) : (
                                <>
                                  <div>
                                    {plan.price.currency}{' '}
                                    {(plan.price.monthly * 12 * 0.9).toFixed(0)}
                                  </div>
                                  <div className="text-xs opacity-80">
                                    {subDict.yearlyDiscount || 'Yearly (10% off)'}
                                  </div>
                                </>
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPlan('')}
                            className="w-full px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                          >
                            {dict.common.cancel || 'Cancel'}
                          </button>
                        </div>
                      ) : isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="w-full px-4 py-2 text-sm font-medium border cursor-default"
                          style={{
                            borderColor: primaryColor,
                            color: primaryColor,
                            background: `${primaryColor}11`,
                          }}
                        >
                          <CheckCircle className="inline h-4 w-4 mr-1.5 mb-0.5" />
                          {subDict.currentPlan || 'Current Plan'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan._id)}
                          className="w-full px-4 py-2 text-white text-sm font-medium transition-opacity"
                          style={{ background: primaryColor }}
                        >
                          <ArrowUp className="inline h-4 w-4 mr-1.5 mb-0.5" />
                          {subDict.selectPlan || 'Select Plan'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-col h-full bg-gray-900 border border-gray-800 text-white">
              <div className="flex-1 flex flex-col p-6 justify-between">
                <div>
                  <div className="mb-5">
                    <div className="inline-flex p-3 border border-yellow-400 bg-yellow-400/10 text-yellow-400 mb-4">
                      <Star className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold">{subDict.enterprise || 'Enterprise'}</h3>
                    <div className="mt-1">
                      <span className="text-2xl font-bold">
                        {subDict.customPricing || 'Custom Pricing'}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-4">
                    <li className="flex items-center">
                      <Star className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-300">
                        {subDict.enterpriseUsers || 'Unlimited users, branches, products'}
                      </span>
                    </li>
                    <li className="flex items-center">
                      <Zap className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-300">
                        {subDict.enterpriseSupport || 'Dedicated support & integrations'}
                      </span>
                    </li>
                    <li className="flex items-center">
                      <CreditCard className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-300">
                        {subDict.enterpriseBilling || 'Custom billing & account manager'}
                      </span>
                    </li>
                  </ul>
                  <div className="pt-3 mb-4 border-t border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      {subDict.fullBirCompliance || 'Full BIR Compliance'}
                    </p>
                    <ul className="space-y-1.5">
                      <li className="flex items-center">
                        <CheckCircle className="h-3.5 w-3.5 text-yellow-400 mr-2 flex-shrink-0" />
                        <span className="text-xs text-gray-400">
                          {subDict.enterpriseBirPtu || 'PTU + CAS + Audit Trail'}
                        </span>
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="h-3.5 w-3.5 text-yellow-400 mr-2 flex-shrink-0" />
                        <span className="text-xs text-gray-400">
                          {subDict.enterpriseBirDocs || 'BIR Documentation & Receipts'}
                        </span>
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="h-3.5 w-3.5 text-yellow-400 mr-2 flex-shrink-0" />
                        <span className="text-xs text-gray-400">
                          {subDict.monthlyComplianceSupport || 'Monthly Compliance Support'}
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href =
                      'mailto:admin@localpro.asia?subject=Enterprise%20Plan%20Inquiry';
                  }}
                  className="w-full px-4 py-2 border border-white text-white text-sm font-medium hover:bg-white hover:text-gray-900 transition-colors"
                >
                  {subDict.contactUs || 'Contact Us'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-10 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap justify-center gap-6">
            {[
              subDict.securePayments || 'Secure Payments',
              subDict.birCompliant || 'BIR Compliant',
              subDict.moneyBack || '30-Day Money Back',
              subDict.dataRetention || '10-Year Data Retention',
            ].map((label) => (
              <div key={label} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-gray-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
