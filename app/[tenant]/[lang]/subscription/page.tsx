'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { Users, Building, Package, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

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
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [showContactForm, setShowContactForm] = useState(false);

  useEffect(() => {
    getDictionaryClient(lang).then((d) => {
      setDict(d);
      loadPlans();
    });
  }, [lang]);

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

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    setShowContactForm(true);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would send an email or create a support ticket
    alert('Thank you for your interest! Our sales team will contact you within 24 hours to complete your subscription setup.');
    router.push(`/${tenant}/${lang}`);
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
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Upgrade Your Account</h1>
                <p className="text-gray-600">Your trial has expired. Choose a plan to continue using all features.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Plan</h2>
          <p className="text-xl text-gray-600">Select the perfect plan for your business needs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {plans.filter(plan => plan.tier !== 'enterprise').map((plan) => (
            <div
              key={plan._id}
              className={`bg-white rounded-lg shadow-md p-6 border-2 transition-all duration-200 ${
                selectedPlan === plan._id
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold">₱{plan.price.monthly}</span>
                  <span className="text-gray-600">/month</span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center">
                  <Users className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                  <span className="text-sm">
                    {plan.features.maxUsers === -1 ? 'Unlimited' : plan.features.maxUsers} users
                  </span>
                </li>
                <li className="flex items-center">
                  <Building className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                  <span className="text-sm">
                    {plan.features.maxBranches === -1 ? 'Unlimited' : plan.features.maxBranches} branches
                  </span>
                </li>
                <li className="flex items-center">
                  <Package className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                  <span className="text-sm">
                    {plan.features.maxProducts === -1 ? 'Unlimited' : plan.features.maxProducts} products
                  </span>
                </li>
                {plan.features.enableDiscounts && (
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm">Discounts & Promotions</span>
                  </li>
                )}
                {plan.features.enableLoyaltyProgram && (
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm">Loyalty Program</span>
                  </li>
                )}
                {plan.features.enableCustomerManagement && (
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm">Customer Management</span>
                  </li>
                )}
                {plan.features.enableBookingScheduling && (
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm">Booking & Scheduling</span>
                  </li>
                )}
                {plan.features.prioritySupport && (
                  <li className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    <span className="text-sm">Priority Support</span>
                  </li>
                )}
              </ul>

              <button
                onClick={() => handlePlanSelect(plan._id)}
                className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
                  selectedPlan === plan._id
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {selectedPlan === plan._id ? 'Selected' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise Plan */}
        <div className="mt-8 text-center">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-8 text-white">
            <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
            <p className="text-lg mb-4">Custom solutions for chains and LGUs</p>
            <p className="text-sm opacity-90 mb-6">
              Unlimited users, branches, and products with dedicated support
            </p>
            <button
              onClick={() => handlePlanSelect('enterprise')}
              className="bg-white text-purple-600 px-6 py-3 rounded-md font-medium hover:bg-gray-100 transition-colors"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </div>

      {/* Contact Form Modal */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Contact Our Sales Team</h3>
            <p className="text-gray-600 mb-6">
              Thank you for choosing {plans.find(p => p._id === selectedPlan)?.name || 'our service'}!
              Our sales team will contact you within 24 hours to complete your subscription setup.
            </p>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your.email@company.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+63 xxx xxx xxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Tell us about your business needs..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowContactForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}