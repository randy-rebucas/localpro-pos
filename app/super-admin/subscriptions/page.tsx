'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface Plan {
  _id: string;
  name: string;
  tier: string;
}

interface Subscription {
  _id: string;
  tenantId: { _id: string; slug: string; name: string } | null;
  planId: { _id: string; name: string; tier: string } | null;
  status: 'active' | 'trial' | 'cancelled' | 'suspended' | 'inactive';
  billingCycle: 'monthly' | 'yearly';
  trialEndDate?: string;
  nextBillingDate?: string;
  cancelledAt?: string;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  trial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  suspended: 'bg-orange-100 text-orange-800 border-orange-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TIER_BADGE: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-700 border-gray-200',
  pro: 'bg-brand-soft text-brand-navy border-teal-200',
  business: 'bg-purple-100 text-purple-800 border-purple-200',
  enterprise: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    sub: Subscription;
    action: 'assign-plan' | 'extend-trial' | 'cancel' | 'activate' | 'suspend';
  } | null>(null);
  const [actionPlanId, setActionPlanId] = useState('');
  const [actionDays, setActionDays] = useState('30');
  const [actionBillingDate, setActionBillingDate] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('tenantSlug', search);
      const [subsRes, plansRes] = await Promise.all([
        fetch(`/api/super-admin/subscriptions?${params}&limit=100`, { credentials: 'include' }),
        fetch('/api/super-admin/plans', { credentials: 'include' }),
      ]);
      const [subsData, plansData] = await Promise.all([subsRes.json(), plansRes.json()]);
      if (subsData.success) setSubscriptions(subsData.data);
      else {
        const errorMsg = subsData.error || 'Failed to load subscriptions';
        setError(errorMsg);
        showToast.error(errorMsg);
        setSubscriptions([]);
      }
      if (plansData.success) setPlans(plansData.data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMsg);
      showToast.error(errorMsg);
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAction = (sub: Subscription, action: typeof actionModal extends { action: infer A } | null ? A : never) => {
    setActionModal({ sub, action });
    setActionPlanId(sub.planId?._id || '');
    setActionDays('30');
    // Default billing date to 1 month from today
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() + 1);
    setActionBillingDate(defaultDate.toISOString().split('T')[0]);
  };

  const executeAction = async () => {
    if (!actionModal) return;
    const { sub, action } = actionModal;
    const tenantSlug = sub.tenantId?.slug;
    if (!tenantSlug) {
      showMsg('error', 'Tenant slug missing — cannot update subscription');
      setActionModal(null);
      return;
    }
    setActionSaving(true);

    const body: Record<string, unknown> = { action };
    if (action === 'assign-plan') {
      body.planId = actionPlanId;
      if (actionBillingDate) body.nextBillingDate = actionBillingDate;
    }
    if (action === 'extend-trial') body.days = parseInt(actionDays);

    try {
      const res = await fetch(`/api/super-admin/subscriptions/${tenantSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setActionModal(null);
        showMsg('success', 'Subscription updated');
        fetchAll();
      } else {
        showMsg('error', data.error || 'Failed to update subscription');
        setActionModal(null);
      }
    } catch {
      showMsg('error', 'An error occurred');
      setActionModal(null);
    } finally {
      setActionSaving(false);
    }
  };

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';

  return (
    <SuperAdminShell>
      <div className="p-6 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage all tenant subscriptions</p>
        </div>

        {message && (
          <div className={`mb-4 p-3 border text-sm ${message.type === 'success' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
            {message.text}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-gray-200 border-b-0 px-4 py-3 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Filter by tenant slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white w-full sm:w-56"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="cancelled">Cancelled</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="bg-white border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin h-6 w-6 border-2 border-brand border-t-transparent rounded-full" />
              <p className="mt-3 text-gray-500 text-sm">Loading subscriptions...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600 text-sm font-medium">{error}</p>
              <button
                onClick={fetchAll}
                className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover"
              >
                Retry
              </button>
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">No subscriptions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Tenant', 'Plan', 'Status', 'Billing', 'Trial End / Next Billing', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {subscriptions.map(sub => (
                    <tr key={sub._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{sub.tenantId?.name || '—'}</p>
                        <p className="text-xs text-gray-400 font-mono">{sub.tenantId?.slug || '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        {sub.planId ? (
                          <span className={`px-2 py-0.5 text-xs font-medium border capitalize ${TIER_BADGE[sub.planId.tier] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {sub.planId.name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No plan</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 text-xs font-semibold border capitalize ${STATUS_BADGE[sub.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 capitalize">{sub.billingCycle}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{sub.status === 'trial' ? formatDate(sub.trialEndDate) : formatDate(sub.nextBillingDate)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => openAction(sub, 'assign-plan')} className="text-xs text-brand hover:text-brand-navy font-medium">
                            Assign Plan
                          </button>
                          <button onClick={() => openAction(sub, 'extend-trial')} className="text-xs text-yellow-600 hover:text-yellow-800 font-medium">
                            Extend Trial
                          </button>
                          {sub.status !== 'active' && (
                            <button onClick={() => openAction(sub, 'activate')} className="text-xs text-green-600 hover:text-green-800 font-medium">
                              Activate
                            </button>
                          )}
                          {sub.status !== 'suspended' && (
                            <button onClick={() => openAction(sub, 'suspend')} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
                              Suspend
                            </button>
                          )}
                          {sub.status !== 'cancelled' && (
                            <button onClick={() => openAction(sub, 'cancel')} className="text-xs text-red-600 hover:text-red-800 font-medium">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1 capitalize">
              {actionModal.action.replace('-', ' ')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Tenant: <span className="font-medium text-gray-700">{actionModal.sub.tenantId?.name}</span>
            </p>

            {actionModal.action === 'assign-plan' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Plan</label>
                  <select
                    value={actionPlanId}
                    onChange={e => setActionPlanId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="">— choose a plan —</option>
                    {plans.map(p => (
                      <option key={p._id} value={p._id}>{p.name} ({p.tier})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Next Billing Date</label>
                  <input
                    type="date"
                    value={actionBillingDate}
                    onChange={e => setActionBillingDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                  />
                  {actionBillingDate && (
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(actionBillingDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {actionModal.action === 'extend-trial' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Extend by (days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={actionDays}
                  onChange={e => setActionDays(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            )}

            {['cancel', 'activate', 'suspend'].includes(actionModal.action) && (
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to <strong>{actionModal.action}</strong> this subscription?
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setActionModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 bg-white"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={actionSaving || (actionModal.action === 'assign-plan' && !actionPlanId)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50"
              >
                {actionSaving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
