'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { showToast } from '@/lib/toast';
import { Users, Building, Package, CheckCircle, Clock, AlertTriangle, ArrowUp, Star, Zap, CreditCard, Loader2 } from 'lucide-react'; // eslint-disable-line @typescript-eslint/no-unused-vars

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
          <Clock className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading subscription plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center space-x-3">
            <ArrowUp className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {dict?.subscription?.upgradeTitle || 'Upgrade Your Subscription'}
              </h1>
              <p className="text-gray-600 mt-1">
                {dict?.subscription?.upgradeMessage || 'Choose a plan that fits your business needs and upgrade today.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {dict?.subscription?.choosePlanTitle || 'Choose Your Plan'}
          </h2>
          <p className="text-sm text-gray-600">
            {dict?.subscription?.choosePlanSubtitle || 'Select the perfect plan for your growing business'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
          {plans.filter(plan => plan.tier !== 'enterprise').map((plan) => (
            <div
              key={plan._id}
              className={`flex flex-col h-full bg-white rounded-lg shadow-md border-2 transition-all duration-200 ${
                selectedPlan === plan._id
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex-1 flex flex-col p-6 justify-between">
                <div>
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                    <div className="mt-4">
                      <span className="text-3xl font-bold text-gray-900">₱{plan.price.monthly}</span>
                      <span className="text-sm text-gray-600">/month</span>
                    </div>
                  </div>
                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center">
                      <Users className="h-4 w-4 text-green-600 mr-3 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxUsers === -1 ? 'Unlimited' : plan.features.maxUsers} users
                      </span>
                    </li>
                    <li className="flex items-center">
                      <Building className="h-4 w-4 text-green-600 mr-3 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxBranches === -1 ? 'Unlimited' : plan.features.maxBranches} branches
                      </span>
                    </li>
                    <li className="flex items-center">
                      <Package className="h-4 w-4 text-green-600 mr-3 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {plan.features.maxProducts === -1 ? 'Unlimited' : plan.features.maxProducts} products
                      </span>
                    </li>
                    {plan.features.enableDiscounts && (
                      <li className="flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-600 mr-3 flex-shrink-0" />
                        <span className="text-sm text-gray-600">Discounts & Promotions</span>
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  {selectedPlan === plan._id ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-gray-700">Choose Billing Cycle:</div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleUpgrade(plan._id, 'monthly')}
                          disabled={upgrading}
                          className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {upgrading ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            <>
                              <div>₱{plan.price.monthly}</div>
                              <div className="text-xs opacity-90">Monthly</div>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleUpgrade(plan._id, 'yearly')}
                          disabled={upgrading}
                          className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {upgrading ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            <>
                              <div>₱{(plan.price.monthly * 12 * 0.9).toFixed(0)}</div>
                              <div className="text-xs opacity-90">Yearly (10% off)</div>
                            </>
                          )}
                        </button>
                      </div>
                      <button
                        onClick={() => setSelectedPlan('')}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handlePlanSelect(plan._id)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Select Plan
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Enterprise Plan Card */}
          <div className="flex flex-col h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg shadow-md border-2 border-purple-600 text-white">
            <div className="flex-1 flex flex-col p-6 justify-between">
              <div>
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold">Enterprise</h3>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">Custom Pricing</span>
                    <span className="text-sm">/month</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-300 mr-3 flex-shrink-0" />
                    <span className="text-sm">Unlimited users, branches, products</span>
                  </li>
                  <li className="flex items-center">
                    <Zap className="h-4 w-4 text-yellow-300 mr-3 flex-shrink-0" />
                    <span className="text-sm">Dedicated support & integrations</span>
                  </li>
                  <li className="flex items-center">
                    <CreditCard className="h-4 w-4 text-yellow-300 mr-3 flex-shrink-0" />
                    <span className="text-sm">Custom billing & account manager</span>
                  </li>
                </ul>
              </div>
              <div>
                <button
                  onClick={() => window.location.href = `mailto:admin@localpro.asia?subject=Enterprise%20Plan%20Inquiry&body=Please%20contact%20me%20regarding%20the%20Enterprise%20plan.`}
                  className="w-full px-4 py-2 bg-white text-purple-600 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Contact Us
                </button>
              </div>
            </div>
          </div>
       
        </div>

        {/* Trust indicators */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500 mb-6">Trusted by businesses worldwide</p>
          <div className="flex justify-center items-center space-x-8">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Secure Payments</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">30-Day Money Back</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">24/7 Support</span>
            </div>
          </div>
        </div>

        {/* Enterprise Plan removed from below, now in main grid above */}
      </div>
    </div>
  );
}
