'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { showToast } from '@/lib/toast';
import { Loader2, Users, Building, Package, CreditCard, CheckCircle, XCircle, Clock, AlertTriangle, ArrowUp, Receipt } from 'lucide-react';

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
  const [dict, setDict] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(false);
  const { subscriptionStatus, refreshSubscription } = useSubscription();

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
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict.admin?.subscriptions || 'My Subscription'}
          </h1>
          <p className="text-gray-600">{dict.admin?.subscriptionDescription || 'View your current subscription and billing history'}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Current Subscription */}
            <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Current Subscription</h2>
              </div>
              <div className="p-6">
                {subscription ? (
                  <div className="space-y-6">
                    {/* Subscription Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <CreditCard className="h-8 w-8 text-blue-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-600">Plan</p>
                            <p className="text-lg font-semibold text-gray-900">{subscription.planId?.name}</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <Clock className="h-8 w-8 text-green-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-600">Status</p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              subscription.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : subscription.status === 'trial'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center">
                          <Receipt className="h-8 w-8 text-purple-600" />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-600">Billing Cycle</p>
                            <p className="text-lg font-semibold text-gray-900 capitalize">{subscription.billingCycle}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Usage Limits */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-md font-semibold text-gray-900 mb-4">Usage Limits</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                          <p className="text-sm text-gray-600">Users</p>
                          <p className="text-lg font-semibold">
                            {subscription.usage.currentUsers} / {subscription.planId?.features.maxUsers === -1 ? '∞' : subscription.planId?.features.maxUsers}
                          </p>
                        </div>
                        <div className="text-center">
                          <Building className="h-6 w-6 mx-auto mb-2 text-green-600" />
                          <p className="text-sm text-gray-600">Branches</p>
                          <p className="text-lg font-semibold">
                            {subscription.usage.currentBranches} / {subscription.planId?.features.maxBranches === -1 ? '∞' : subscription.planId?.features.maxBranches}
                          </p>
                        </div>
                        <div className="text-center">
                          <Package className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                          <p className="text-sm text-gray-600">Products</p>
                          <p className="text-lg font-semibold">
                            {subscription.usage.currentProducts} / {subscription.planId?.features.maxProducts === -1 ? '∞' : subscription.planId?.features.maxProducts}
                          </p>
                        </div>
                        <div className="text-center">
                          <Receipt className="h-6 w-6 mx-auto mb-2 text-orange-600" />
                          <p className="text-sm text-gray-600">Transactions</p>
                          <p className="text-lg font-semibold">
                            {subscription.usage.currentTransactions} / {subscription.planId?.features.maxTransactions === -1 ? '∞' : subscription.planId?.features.maxTransactions}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Subscription Actions */}
                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-600">Need to upgrade or modify your plan?</p>
                        </div>
                        <button
                          onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
                          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center text-sm font-medium"
                        >
                          <ArrowUp className="h-4 w-4 mr-2" />
                          Upgrade Plan
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscription</h3>
                    <p className="text-gray-600 mb-4">You don't have an active subscription. Contact support to get started.</p>
                    <button
                      onClick={() => router.push(`/${tenant}/${lang}/subscription`)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                    >
                      View Plans
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Billing History */}
            <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Billing History</h2>
                <button
                  onClick={fetchBillingHistory}
                  disabled={billingLoading}
                  className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50"
                >
                  {billingLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <div className="p-6">
                {billingHistory.length > 0 ? (
                  <div className="space-y-4">
                    {billingHistory.map((transaction) => (
                      <div key={transaction._id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`p-2 rounded-full ${
                            transaction.status === 'paid' ? 'bg-green-100' :
                            transaction.status === 'pending' ? 'bg-yellow-100' :
                            transaction.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                          }`}>
                            <Receipt className={`h-5 w-5 ${
                              transaction.status === 'paid' ? 'text-green-600' :
                              transaction.status === 'pending' ? 'text-yellow-600' :
                              transaction.status === 'failed' ? 'text-red-600' : 'text-gray-600'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              ₱{transaction.amount} - {transaction.billingCycle} billing
                            </p>
                            <p className="text-sm text-gray-600">
                              {new Date(transaction.periodStart).toLocaleDateString()} - {new Date(transaction.periodEnd).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            transaction.status === 'paid' ? 'bg-green-100 text-green-800' :
                            transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            transaction.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">No billing history available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}