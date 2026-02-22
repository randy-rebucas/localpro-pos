'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { showToast } from '@/lib/toast'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { Loader2, Users, Building, Package, CreditCard, Clock, AlertTriangle, ArrowUp, Receipt } from 'lucide-react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import Link from 'next/link';

interface SubscriptionPlan {
  _id: string;
  name: string;
  tier: string;
  description?: string;
  price: {
    monthly: number;
    currency: string;
  };
  features: {
    maxUsers: number;
    maxBranches: number;
    maxProducts: number;
    maxTransactions: number;
    enableInventory: boolean;
    enableCategories: boolean;
    enableDiscounts: boolean;
    enableLoyaltyProgram: boolean;
    enableCustomerManagement: boolean;
    enableBookingScheduling: boolean;
    enableReports: boolean;
    enableMultiBranch: boolean;
    enableHardwareIntegration: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    dedicatedAccountManager: boolean;
  };
  isActive: boolean;
  isCustom: boolean;
}

interface Subscription {
  _id: string;
  tenantId: {
    _id: string;
    slug: string;
    name: string;
  };
  planId: SubscriptionPlan;
  status: 'active' | 'inactive' | 'cancelled' | 'suspended' | 'trial';
  billingCycle: 'monthly' | 'yearly';
  startDate: string;
  endDate?: string;
  trialEndDate?: string;
  nextBillingDate?: string;
  isTrial: boolean;
  autoRenew: boolean;
  usage: {
    currentUsers: number;
    currentBranches: number;
    currentProducts: number;
    currentTransactions: number;
  };
}

interface BillingTransaction {
  _id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  billingCycle: 'monthly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  description?: string;
}

export default function SubscriptionsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const { subscriptionStatus, refreshSubscription } = useSubscription(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/subscriptions/current', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSubscription(data.data);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingHistory = async () => {
    try {
      setBillingLoading(true);
      const res = await fetch('/api/subscriptions/billing-history', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBillingHistory(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching billing history:', error);
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchSubscription();
    fetchBillingHistory();
  }, [lang, tenant]);

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8 rounded-full"
            style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}`, borderBottom: '2px solid transparent', borderLeft: `2px solid ${primaryColor}` }}
          />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {dict.common?.back || 'Back'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict.admin?.subscriptions || 'My Subscription'}
          </h1>
          <p className="text-gray-600">{dict.admin?.subscriptionDescription || 'View your current subscription and billing history'}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div
              className="inline-block animate-spin h-8 w-8 rounded-full"
              style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}`, borderBottom: '2px solid transparent', borderLeft: `2px solid ${primaryColor}` }}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Subscription */}
            <div className="bg-white border p-6" style={{ borderColor: primaryColor }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className="inline-flex p-3 border"
                    style={{ background: `${primaryColor}11`, color: primaryColor, borderColor: primaryColor }}
                  >
                    <CreditCard className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{dict?.admin?.currentSubscription || 'Current Subscription'}</h2>
                    {subscription && (
                      <p className="text-sm text-gray-500">{subscription.planId?.name} &mdash; <span className="capitalize">{subscription.billingCycle}</span></p>
                    )}
                  </div>
                </div>
                {subscription && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    subscription.status === 'active' ? 'bg-green-100 text-green-800' :
                    subscription.status === 'trial' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {({ active: dict?.admin?.active || 'Active', inactive: dict?.admin?.inactive || 'Inactive', trial: dict?.admin?.trial || 'Trial', suspended: dict?.admin?.suspended || 'Suspended', cancelled: 'Cancelled' } as Record<string,string>)[subscription.status] ?? subscription.status}
                  </span>
                )}
              </div>

              {subscription ? (
                <div className="space-y-6">
                  {/* Usage Limits */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded p-4 text-center">
                      <div className="text-2xl font-bold mb-1" style={{ color: primaryColor }}>
                        {subscription.usage.currentUsers}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dict?.admin?.users || 'Users'} / {subscription.planId?.features.maxUsers === -1 ? '∞' : subscription.planId?.features.maxUsers}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-4 text-center">
                      <div className="text-2xl font-bold text-green-600 mb-1">
                        {subscription.usage.currentBranches}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dict?.admin?.branches || 'Branches'} / {subscription.planId?.features.maxBranches === -1 ? '∞' : subscription.planId?.features.maxBranches}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-4 text-center">
                      <div className="text-2xl font-bold text-orange-600 mb-1">
                        {subscription.usage.currentProducts}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dict?.admin?.products || 'Products'} / {subscription.planId?.features.maxProducts === -1 ? '∞' : subscription.planId?.features.maxProducts}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600 mb-1">
                        {subscription.usage.currentTransactions}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dict?.admin?.transactions || 'Transactions'} / {subscription.planId?.features.maxTransactions === -1 ? '∞' : subscription.planId?.features.maxTransactions}
                      </div>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="border-t border-gray-100 pt-5 flex items-center justify-between">
                    <p className="text-sm text-gray-500">{dict?.admin?.upgradePlanHint || 'Need to upgrade or modify your plan?'}</p>
                    <button
                      onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white transition-colors"
                      style={{ background: primaryColor }}
                    >
                      <ArrowUp className="h-4 w-4 mr-2" />
                      {dict?.admin?.upgradePlan || 'Upgrade Plan'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{dict?.admin?.noSubscription || 'No Active Subscription'}</h3>
                  <p className="text-gray-500 text-sm mb-6">{dict?.admin?.noSubscriptionHint || "You don't have an active subscription. Contact support to get started."}</p>
                  <button
                    onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white transition-colors"
                    style={{ background: primaryColor }}
                  >
                    {dict?.admin?.viewPlans || 'View Plans'}
                  </button>
                </div>
              )}
            </div>

            {/* Billing History */}
            <div className="bg-white border p-6" style={{ borderColor: primaryColor }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className="inline-flex p-3 border"
                    style={{ background: `${primaryColor}11`, color: primaryColor, borderColor: primaryColor }}
                  >
                    <Receipt className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{dict?.admin?.billingHistory || 'Billing History'}</h2>
                </div>
                <button
                  onClick={fetchBillingHistory}
                  disabled={billingLoading}
                  className="text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ color: primaryColor }}
                >
                  {billingLoading ? (dict?.common?.loading || 'Loading...') : (dict?.common?.refresh || 'Refresh')}
                </button>
              </div>

              {billingHistory.length > 0 ? (
                <div className="space-y-3">
                  {billingHistory.map((transaction) => (
                    <div key={transaction._id} className="flex items-center justify-between p-4 border border-gray-100 bg-gray-50">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 ${
                          transaction.status === 'paid' ? 'bg-green-100 text-green-600' :
                          transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                          transaction.status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Receipt className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            ₱{transaction.amount} &mdash; <span className="capitalize">{transaction.billingCycle}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(transaction.periodStart).toLocaleDateString()} – {new Date(transaction.periodEnd).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(transaction.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        transaction.status === 'paid' ? 'bg-green-100 text-green-800' :
                        transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        transaction.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 text-sm">{dict?.admin?.noBillingHistory || 'No billing history available'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}