'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { SubscriptionService } from '@/lib/subscription';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { Loader2, Plus, Users, Building, Package, CreditCard, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

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

export default function SubscriptionsPage() {
    const params = useParams();
    const router = useRouter();
    const tenant = params.tenant as string;
    const lang = params.lang as 'en' | 'es';
    const [dict, setDict] = useState<any>(null);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState('');
    const [selectedPlan, setSelectedPlan] = useState('');
    const [tenants, setTenants] = useState<any[]>([]);
    const { refreshSubscription } = useSubscription();
    const { confirm, Dialog: ConfirmDialog } = useConfirm();

    useEffect(() => {
        getDictionaryClient(lang).then(setDict);
        fetchSubscriptions();
        fetchPlans();
        fetchTenants();
    }, [lang, tenant]);

    const fetchSubscriptions = async () => {
        try {
            const res = await fetch('/api/subscriptions', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setSubscriptions(data.data);
                setMessage(null);
            } else {
                setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchData || 'Failed to fetch subscriptions' });
            }
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            setMessage({ type: 'error', text: dict?.common?.failedToFetchData || 'Failed to fetch subscriptions' });
        } finally {
            setLoading(false);
        }
    };

    const fetchPlans = async () => {
        try {
            const res = await fetch('/api/subscription-plans', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setPlans(data.data);
            }
        } catch (error) {
            console.error('Error fetching plans:', error);
        }
    };

    const fetchTenants = async () => {
        try {
            const res = await fetch('/api/tenants', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                setTenants(data.data);
            }
        } catch (error) {
            console.error('Error fetching tenants:', error);
        }
    };

    const handleCreateSubscription = async () => {
        if (!selectedTenant || !selectedPlan) {
            setMessage({ type: 'error', text: dict?.common?.pleaseSelectBothFields || 'Please select both tenant and plan' });
            return;
        }

        try {
            const response = await fetch('/api/subscriptions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tenantId: selectedTenant,
                    planId: selectedPlan,
                    isTrial: true,
                    billingCycle: 'monthly',
                }),
            });

            const data = await response.json();

            if (data.success) {
                showToast.success(dict?.admin?.subscriptionCreatedSuccess || dict?.common?.subscriptionCreatedSuccess || 'Subscription created successfully');
                setShowCreateDialog(false);
                setSelectedTenant('');
                setSelectedPlan('');
                fetchSubscriptions();
                refreshSubscription();
            } else {
                setMessage({ type: 'error', text: data.error || dict?.admin?.failedToCreateSubscription || dict?.common?.failedToCreateSubscription || 'Failed to create subscription' });
            }
        } catch (error) {
            console.error('Error creating subscription:', error);
            setMessage({ type: 'error', text: dict?.admin?.failedToCreateSubscription || dict?.common?.failedToCreateSubscription || 'Failed to create subscription' });
        }
    };

    const handleUpdateSubscriptionStatus = async (subscriptionId: string, status: string, action: string) => {
        if (!dict) return;
        const confirmed = await confirm(
            dict.common?.confirmAction || 'Confirm Action',
            dict.common?.confirmUpdateSubscription || `Are you sure you want to ${action.toLowerCase()} this subscription?`,
            { variant: 'warning' }
        );
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status }),
            });

            const data = await response.json();

            if (data.success) {
                showToast.success(dict?.admin?.subscriptionUpdatedSuccess || dict?.common?.subscriptionUpdatedSuccess || 'Subscription updated successfully');
                fetchSubscriptions();
                refreshSubscription();
            } else {
                setMessage({ type: 'error', text: data.error || dict?.admin?.failedToUpdateSubscription || dict?.common?.failedToUpdateSubscription || 'Failed to update subscription' });
            }
        } catch (error) {
            console.error('Error updating subscription:', error);
            setMessage({ type: 'error', text: dict?.admin?.failedToUpdateSubscription || dict?.common?.failedToUpdateSubscription || 'Failed to update subscription' });
        }
    };

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case 'active':
                return 'bg-green-100 text-green-800';
            case 'trial':
                return 'bg-blue-100 text-blue-800';
            case 'inactive':
                return 'bg-gray-100 text-gray-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            case 'suspended':
                return 'bg-yellow-100 text-yellow-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

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
                        {dict.admin?.subscriptions || 'Subscriptions'}
                    </h1>
                    <p className="text-gray-600">{dict.admin?.subscriptionsDescription || 'Manage tenant subscriptions and billing'}</p>
                </div>

                {/* Message Display */}
                {message && (
                    <div className={`mb-6 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        {message.text}
                    </div>
                )}


                {/* Subscription Plans Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {plans.map((plan) => (
                        <div key={plan._id} className="bg-white border border-gray-300 p-6 rounded-lg">
                            <div className="mb-4">
                                <h3 className="text-lg font-semibold">{plan.name}</h3>
                                <div className="text-2xl font-bold">
                                    ₱{plan.price.monthly}
                                    <span className="text-sm font-normal text-gray-500">/month</span>
                                </div>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center">
                                    <Users className="h-4 w-4 mr-2" />
                                    {plan.features.maxUsers === -1 ? 'Unlimited' : plan.features.maxUsers} users
                                </div>
                                <div className="flex items-center">
                                    <Building className="h-4 w-4 mr-2" />
                                    {plan.features.maxBranches === -1 ? 'Unlimited' : plan.features.maxBranches} branches
                                </div>
                                <div className="flex items-center">
                                    <Package className="h-4 w-4 mr-2" />
                                    {plan.features.maxProducts === -1 ? 'Unlimited' : plan.features.maxProducts} products
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Active Subscriptions */}
                <div className="bg-white border border-gray-300 rounded-lg">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-xl font-semibold">Active Subscriptions</h2>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            {subscriptions.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">
                                    No subscriptions found. Create your first subscription to get started.
                                </p>
                            ) : (
                                subscriptions.map((subscription) => (
                                    <div key={subscription._id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-semibold">{subscription.tenantId.name}</h3>
                                                <p className="text-sm text-gray-600">{subscription.tenantId.slug}</p>
                                            </div>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeVariant(subscription.status)}`}>
                                                {subscription.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm font-medium">Plan</p>
                                                <p className="text-sm text-gray-600">{subscription.planId.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Billing</p>
                                                <p className="text-sm text-gray-600 capitalize">{subscription.billingCycle}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Users</p>
                                                <p className="text-sm text-gray-600">
                                                    {subscription.usage.currentUsers} / {subscription.planId.features.maxUsers === -1 ? '∞' : subscription.planId.features.maxUsers}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Next Billing</p>
                                                <p className="text-sm text-gray-600">
                                                    {subscription.nextBillingDate ? new Date(subscription.nextBillingDate).toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex justify-end space-x-2">
                                            {subscription.status === 'trial' && (
                                                <button
                                                    onClick={() => handleUpdateSubscriptionStatus(subscription._id, 'active', dict?.admin?.activate || 'Activate')}
                                                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 font-medium"
                                                >
                                                    {dict?.admin?.activate || 'Activate'}
                                                </button>
                                            )}
                                            {subscription.status === 'active' && (
                                                <button
                                                    onClick={() => handleUpdateSubscriptionStatus(subscription._id, 'suspended', dict?.admin?.suspend || 'Suspend')}
                                                    className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 font-medium"
                                                >
                                                    {dict?.admin?.suspend || 'Suspend'}
                                                </button>
                                            )}
                                            {subscription.status === 'suspended' && (
                                                <button
                                                    onClick={() => handleUpdateSubscriptionStatus(subscription._id, 'active', dict?.admin?.reactivate || 'Reactivate')}
                                                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 font-medium"
                                                >
                                                    {dict?.admin?.reactivate || 'Reactivate'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleUpdateSubscriptionStatus(subscription._id, 'cancelled', dict?.admin?.cancel || 'Cancel')}
                                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 font-medium"
                                            >
                                                {dict?.admin?.cancel || 'Cancel'}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Create Subscription Dialog */}
                {showCreateDialog && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-md">
                            <h3 className="text-lg font-semibold mb-4">Create New Subscription</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Tenant</label>
                                    <select
                                        value={selectedTenant}
                                        onChange={(e) => setSelectedTenant(e.target.value)}
                                        className="w-full border border-gray-300 rounded px-3 py-2"
                                    >
                                        <option value="">Select a tenant</option>
                                        {tenants.map((tenant) => (
                                            <option key={tenant._id} value={tenant._id}>
                                                {tenant.name} ({tenant.slug})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Subscription Plan</label>
                                    <select
                                        value={selectedPlan}
                                        onChange={(e) => setSelectedPlan(e.target.value)}
                                        className="w-full border border-gray-300 rounded px-3 py-2"
                                    >
                                        <option value="">Select a plan</option>
                                        {plans.map((plan) => (
                                            <option key={plan._id} value={plan._id}>
                                                {plan.name} - ₱{plan.price.monthly}/month
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex justify-end space-x-2">
                                    <button
                                        onClick={() => setShowCreateDialog(false)}
                                        className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateSubscription}
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                                    >
                                        {dict.admin?.createSubscription || 'Create Subscription'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {ConfirmDialog}
            </div>
        </div>
    );
}
