'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Users, Building, Package, CheckCircle, ArrowUp, Star, Zap, CreditCard, Loader2 } from 'lucide-react'; // eslint-disable-line @typescript-eslint/no-unused-vars

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

export default function SubscriptionPage() {
  const params = useParams();
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const tenant = params.tenant as string; // eslint-disable-line @typescript-eslint/no-unused-vars
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [upgrading, setUpgrading] = useState(false);
  const { settings } = useTenantSettings();
  const tenantSettings = settings || getDefaultTenantSettings();
  const primaryColor = tenantSettings.primaryColor || '#2563eb';

  const loadPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/subscription-plans');
      const result = await response.json();

      if (result.success) {
        setPlans(result.data);
      }
    } catch (error) {
      console.error('Failed to load plans:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    loadPlans();
  }, [lang]);

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
  };

  const handleUpgrade = async (planId: string, billingCycle: 'monthly' | 'yearly' = 'monthly') => {
    const selectedPlanData = plans.find(p => p._id === planId);
    if (!selectedPlanData) return;

    setUpgrading(true);
    try {
      // Create PayPal payment
      const response = await fetch('/api/paypal/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          planId: planId,
          billingCycle: billingCycle,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Store plan data for later use
        localStorage.setItem('paypal_subscription_plan', JSON.stringify({
          planId,
          billingCycle,
          amount: data.data.amount,
          currency: data.data.currency,
        }));

        // Redirect to PayPal
        window.location.href = data.data.paypalOrder.links.find((link: any) => link.rel === 'approve').href; // eslint-disable-line @typescript-eslint/no-explicit-any
      } else {
        showToast.error(data.error || 'Failed to create payment');
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      showToast.error('Failed to initiate payment');
    } finally {
      setUpgrading(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8 rounded-full"
            style={{ borderTop: `2px solid ${primaryColor}`, borderRight: `2px solid ${primaryColor}`, borderBottom: '2px solid transparent', borderLeft: `2px solid ${primaryColor}` }}
          />
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
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
            href={`/${tenant}/${lang}/admin/subscriptions`}
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 mb-4"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {dict?.common?.back || 'Back'}
          </Link>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            {dict?.subscription?.upgradeTitle || 'Upgrade Your Subscription'}
          </h1>
          <p className="text-gray-600">
            {dict?.subscription?.upgradeMessage || 'Choose a plan that fits your business needs.'}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {plans.filter(plan => plan.tier !== 'enterprise').map((plan) => (
            <div
              key={plan._id}
              className="flex flex-col h-full bg-white border transition-all duration-200"
              style={{
                borderColor: selectedPlan === plan._id ? primaryColor : '#d1d5db',
                boxShadow: selectedPlan === plan._id ? `0 0 0 2px ${primaryColor}33` : undefined,
              }}
            >
              <div className="flex-1 flex flex-col p-6 justify-between">
                <div>
                  <div className="mb-5">
                    <div
                      className="inline-flex p-3 border mb-4"
                      style={{ background: `${primaryColor}11`, color: primaryColor, borderColor: primaryColor }}
                    >
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <div className="mt-1">
                      <span className="text-3xl font-bold text-gray-900">₱{plan.price.monthly}</span>
                      <span className="text-sm text-gray-500 ml-1">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6">
                    <li className="flex items-center">
                      <Users className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxUsers === -1 ? 'Unlimited' : plan.features.maxUsers} users
                      </span>
                    </li>
                    <li className="flex items-center">
                      <Building className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxBranches === -1 ? 'Unlimited' : plan.features.maxBranches} branches
                      </span>
                    </li>
                    <li className="flex items-center">
                      <Package className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxProducts === -1 ? 'Unlimited' : plan.features.maxProducts} products
                      </span>
                    </li>
                    {plan.features.enableDiscounts && (
                      <li className="flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">Discounts & Promotions</span>
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  {selectedPlan === plan._id ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-600 mb-1">{dict?.subscription?.chooseBilling || 'Choose Billing Cycle'}:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpgrade(plan._id, 'monthly')}
                          disabled={upgrading}
                          className="px-3 py-2 text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                          style={{ background: primaryColor }}
                        >
                          {upgrading ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            <><div>₱{plan.price.monthly}</div><div className="text-xs opacity-80">Monthly</div></>
                          )}
                        </button>
                        <button
                          onClick={() => handleUpgrade(plan._id, 'yearly')}
                          disabled={upgrading}
                          className="px-3 py-2 bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-opacity"
                        >
                          {upgrading ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            <><div>₱{(plan.price.monthly * 12 * 0.9).toFixed(0)}</div><div className="text-xs opacity-80">Yearly (10% off)</div></>
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => setSelectedPlan('')}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        {dict?.common?.cancel || 'Cancel'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handlePlanSelect(plan._id)}
                      className="w-full px-4 py-2 text-white text-sm font-medium transition-opacity"
                      style={{ background: primaryColor }}
                    >
                      {dict?.subscription?.selectPlan || 'Select Plan'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Enterprise Plan */}
          <div className="flex flex-col h-full bg-gray-900 border border-gray-800 text-white">
            <div className="flex-1 flex flex-col p-6 justify-between">
              <div>
                <div className="mb-5">
                  <div className="inline-flex p-3 border border-yellow-400 bg-yellow-400/10 text-yellow-400 mb-4">
                    <Star className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold">Enterprise</h3>
                  <div className="mt-1">
                    <span className="text-2xl font-bold">Custom Pricing</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-gray-300">Unlimited users, branches, products</span>
                  </li>
                  <li className="flex items-center">
                    <Zap className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-gray-300">Dedicated support & integrations</span>
                  </li>
                  <li className="flex items-center">
                    <CreditCard className="h-4 w-4 text-yellow-400 mr-2 flex-shrink-0" />
                    <span className="text-sm text-gray-300">Custom billing & account manager</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => { window.location.href = 'mailto:admin@localpro.asia?subject=Enterprise%20Plan%20Inquiry'; }}
                className="w-full px-4 py-2 border border-white text-white text-sm font-medium hover:bg-white hover:text-gray-900 transition-colors"
              >
                {dict?.subscription?.contactUs || 'Contact Us'}
              </button>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-10 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-gray-600">Secure Payments</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-gray-600">30-Day Money Back</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-gray-600">24/7 Support</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
