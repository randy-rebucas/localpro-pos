'use client';

import { useEffect, useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface Plan { _id: string; name: string; tier: string; }

interface Subscription {
  _id: string;
  tenantId: { _id: string; slug: string; name: string } | null;
  planId: { _id: string; name: string; tier: string } | null;
  status: 'active' | 'trial' | 'cancelled' | 'suspended' | 'inactive' | 'paused';
  billingCycle: 'monthly' | 'yearly';
  trialEndDate?: string;
  nextBillingDate?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  pausedAt?: string;
  pauseReason?: string;
  pauseEndsAt?: string;
  gracePeriodEndDate?: string;
}

type ActionType = 'assign-plan' | 'extend-trial' | 'cancel' | 'activate' | 'suspend' | 'pause' | 'resume' | 'record-payment';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800 border-green-200',
  trial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  suspended: 'bg-orange-100 text-orange-800 border-orange-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  paused: 'bg-blue-100 text-blue-700 border-blue-200',
};

const TIER_BADGE: Record<string, string> = {
  starter: 'bg-gray-100 text-gray-700 border-gray-200',
  pro: 'bg-teal-50 text-teal-800 border-teal-200',
  business: 'bg-purple-100 text-purple-800 border-purple-200',
  enterprise: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [actionModal, setActionModal] = useState<{ sub: Subscription; action: ActionType } | null>(null);
  const [actionPlanId, setActionPlanId] = useState('');
  const [actionDays, setActionDays] = useState('30');
  const [actionBillingDate, setActionBillingDate] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const [actionGraceDays, setActionGraceDays] = useState('');
  const [actionTxId, setActionTxId] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
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
      else showToast.error(subsData.error || 'Failed to load subscriptions');
      if (plansData.success) setPlans(plansData.data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAction = (sub: Subscription, action: ActionType) => {
    setActionModal({ sub, action });
    setActionPlanId(sub.planId?._id || '');
    setActionDays('30');
    setActionReason('');
    setActionAmount('');
    setActionGraceDays('');
    setActionTxId('');
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setActionBillingDate(d.toISOString().slice(0, 10));
  };

  const executeAction = async () => {
    if (!actionModal) return;
    const { sub, action } = actionModal;
    const tenantSlug = sub.tenantId?.slug;
    if (!tenantSlug) { showToast.error('Tenant slug missing'); setActionModal(null); return; }
    setActionSaving(true);

    const body: Record<string, unknown> = { action };
    if (action === 'assign-plan') { body.planId = actionPlanId; if (actionBillingDate) body.nextBillingDate = actionBillingDate; }
    if (action === 'extend-trial') body.days = parseInt(actionDays);
    if (action === 'cancel') body.reason = actionReason;
    if (action === 'suspend') body.graceDays = actionGraceDays ? parseInt(actionGraceDays) : undefined;
    if (action === 'pause') { body.pauseReason = actionReason; body.pauseDays = actionDays ? parseInt(actionDays) : undefined; }
    if (action === 'record-payment') { body.amount = parseFloat(actionAmount); body.notes = actionReason; body.transactionId = actionTxId; }

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
        showToast.success('Subscription updated');
        fetchAll();
      } else {
        showToast.error(data.error || 'Failed to update subscription');
        setActionModal(null);
      }
    } catch {
      showToast.error('An error occurred');
      setActionModal(null);
    } finally {
      setActionSaving(false);
    }
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—';

  return (
    <SuperAdminShell title="Subscriptions">
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Filter by tenant slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-teal/30 w-full sm:w-56"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-teal/30 bg-white"
          >
            <option value="">All statuses</option>
            {['active', 'trial', 'paused', 'suspended', 'cancelled', 'inactive'].map(s => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No subscriptions found.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Tenant', 'Plan', 'Status', 'Billing', 'Key Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {subscriptions.map(sub => (
                  <tr key={sub._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{sub.tenantId?.name || '—'}</p>
                      <p className="text-xs text-gray-400 font-mono">{sub.tenantId?.slug || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {sub.planId ? (
                        <span className={`px-2 py-0.5 text-xs font-medium border rounded-full capitalize ${TIER_BADGE[sub.planId.tier] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                          {sub.planId.name}
                        </span>
                      ) : <span className="text-xs text-gray-400 italic">No plan</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold border rounded-full capitalize ${STATUS_BADGE[sub.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {sub.status}
                      </span>
                      {sub.cancellationReason && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[120px]" title={sub.cancellationReason}>{sub.cancellationReason}</div>}
                      {sub.pauseReason && <div className="text-xs text-blue-400 mt-0.5 truncate max-w-[120px]" title={sub.pauseReason}>{sub.pauseReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{sub.billingCycle}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {sub.status === 'trial' ? <><span className="text-gray-400">Trial ends </span>{fmt(sub.trialEndDate)}</> :
                       sub.status === 'paused' && sub.pauseEndsAt ? <><span className="text-gray-400">Resumes </span>{fmt(sub.pauseEndsAt)}</> :
                       sub.status === 'suspended' && sub.gracePeriodEndDate ? <><span className="text-orange-400">Grace ends </span>{fmt(sub.gracePeriodEndDate)}</> :
                       fmt(sub.nextBillingDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => openAction(sub, 'assign-plan')} className="text-xs text-brand-teal hover:underline font-medium">Plan</button>
                        <button onClick={() => openAction(sub, 'extend-trial')} className="text-xs text-yellow-600 hover:underline">+Trial</button>
                        <button onClick={() => openAction(sub, 'record-payment')} className="text-xs text-green-600 hover:underline">Payment</button>
                        {sub.status !== 'active' && <button onClick={() => openAction(sub, 'activate')} className="text-xs text-green-700 hover:underline">Activate</button>}
                        {sub.status === 'paused' && <button onClick={() => openAction(sub, 'resume')} className="text-xs text-blue-600 hover:underline">Resume</button>}
                        {!['paused'].includes(sub.status) && <button onClick={() => openAction(sub, 'pause')} className="text-xs text-blue-500 hover:underline">Pause</button>}
                        {sub.status !== 'suspended' && <button onClick={() => openAction(sub, 'suspend')} className="text-xs text-orange-600 hover:underline">Suspend</button>}
                        {sub.status !== 'cancelled' && <button onClick={() => openAction(sub, 'cancel')} className="text-xs text-red-500 hover:underline">Cancel</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900 capitalize">{actionModal.action.replace(/-/g, ' ')}</h2>
              <button onClick={() => setActionModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Tenant: <span className="font-medium text-gray-800">{actionModal.sub.tenantId?.name}</span></p>

              {actionModal.action === 'assign-plan' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                    <select value={actionPlanId} onChange={e => setActionPlanId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— choose —</option>
                      {plans.map(p => <option key={p._id} value={p._id}>{p.name} ({p.tier})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Next Billing Date</label>
                    <input type="date" value={actionBillingDate} onChange={e => setActionBillingDate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {actionModal.action === 'extend-trial' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Extend by (days)</label>
                  <input type="number" min="1" max="365" value={actionDays} onChange={e => setActionDays(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}

              {actionModal.action === 'cancel' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cancellation Reason</label>
                  <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                    placeholder="Optional reason for cancellation…"
                    className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                </div>
              )}

              {actionModal.action === 'suspend' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days, optional)</label>
                  <input type="number" min="0" max="90" value={actionGraceDays} onChange={e => setActionGraceDays(e.target.value)}
                    placeholder="0 = no grace period"
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}

              {actionModal.action === 'pause' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pause Reason</label>
                    <input value={actionReason} onChange={e => setActionReason(e.target.value)}
                      placeholder="e.g. Customer requested break"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Auto-resume after (days, optional)</label>
                    <input type="number" min="1" value={actionDays} onChange={e => setActionDays(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {actionModal.action === 'record-payment' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱) *</label>
                    <input type="number" min="0" step="0.01" value={actionAmount} onChange={e => setActionAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Transaction ID</label>
                    <input value={actionTxId} onChange={e => setActionTxId(e.target.value)}
                      placeholder="Optional"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input value={actionReason} onChange={e => setActionReason(e.target.value)}
                      placeholder="Optional notes"
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {['activate', 'resume'].includes(actionModal.action) && (
                <p className="text-sm text-gray-600">Confirm to <strong>{actionModal.action}</strong> this subscription?</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t justify-end">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={executeAction}
                disabled={actionSaving || (actionModal.action === 'assign-plan' && !actionPlanId) || (actionModal.action === 'record-payment' && !actionAmount)}
                className="px-4 py-2 bg-brand-teal text-white rounded-lg text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50"
              >
                {actionSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
