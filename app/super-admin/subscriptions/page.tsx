'use client';

import { useEffect, useState, useCallback } from 'react';
import { showToast } from '@/lib/toast';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface Plan { id: string; name: string; tier: string; }

interface Subscription {
  id: string;
  tenant: { slug: string; name: string } | null;
  plan: { id: string; name: string; tier: string } | null;
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
  active: 'bg-win8-success text-white',
  trial: 'bg-win8-warning text-white',
  cancelled: 'bg-win8-danger text-white',
  suspended: 'bg-win8-suspended text-white',
  inactive: 'bg-gray-500 text-white',
  paused: 'bg-win8-info text-white',
};

const TIER_BADGE: Record<string, string> = {
  starter: 'bg-gray-500 text-white',
  pro: 'bg-brand text-white',
  business: 'bg-win8-accent text-white',
  enterprise: 'bg-brand-navy text-white',
};

const ACTION_BUTTON: Record<ActionType, string> = {
  'assign-plan': 'bg-brand',
  'extend-trial': 'bg-win8-warning',
  'record-payment': 'bg-win8-success',
  activate: 'bg-win8-success',
  resume: 'bg-win8-info',
  pause: 'bg-gray-500',
  suspend: 'bg-win8-suspended',
  cancel: 'bg-win8-danger',
};

const ACTION_LABEL: Record<ActionType, string> = {
  'assign-plan': 'Plan',
  'extend-trial': 'Extend Trial',
  'record-payment': 'Record Payment',
  activate: 'Activate',
  resume: 'Resume',
  pause: 'Pause',
  suspend: 'Suspend',
  cancel: 'Cancel',
};

function ActionIcon({ action }: { action: ActionType }) {
  const common = { className: 'w-4 h-4', viewBox: '0 0 24 24', 'aria-hidden': true as const };
  switch (action) {
    case 'assign-plan':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1H9V5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6" />
        </svg>
      );
    case 'extend-trial':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
        </svg>
      );
    case 'record-payment':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h3" />
        </svg>
      );
    case 'activate':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
        </svg>
      );
    case 'resume':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14M16 5v14" />
        </svg>
      );
    case 'suspend':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m5.5 5.5 13 13" />
        </svg>
      );
    case 'cancel':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      );
  }
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [actionModal, setActionModal] = useState<{ sub: Subscription; action: ActionType } | null>(null);
  const [displayActionModal, setDisplayActionModal] = useState<{ sub: Subscription; action: ActionType } | null>(null);
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

  useEffect(() => { if (actionModal) setDisplayActionModal(actionModal); }, [actionModal]);

  const openAction = (sub: Subscription, action: ActionType) => {
    setActionModal({ sub, action });
    setActionPlanId(sub.plan?.id || '');
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
    const tenantSlug = sub.tenant?.slug;
    if (!tenantSlug) { showToast.error('Tenant slug missing'); setActionModal(null); return; }
    setActionSaving(true);

    const body: Record<string, unknown> = { action };
    if (action === 'assign-plan') { body.planId = actionPlanId; if (actionBillingDate) body.nextBillingDate = actionBillingDate; }
    if (action === 'extend-trial') body.days = parseInt(actionDays);
    if (action === 'cancel') body.reason = actionReason;
    if (action === 'suspend') body.graceDays = actionGraceDays ? parseInt(actionGraceDays) : undefined;
    if (action === 'pause') { body.pauseReason = actionReason; body.pauseDays = actionDays ? parseInt(actionDays) : undefined; }
    if (action === 'record-payment') { body.amount = parseFloat(actionAmount); body.notes = actionReason; body.transactionId = actionTxId; }
    if (action === 'activate' && sub.status === 'cancelled') body.reactivationReason = actionReason;

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
    <>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-300 p-3">
          <div className="relative">
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
            </svg>
            <input
              type="text"
              placeholder="Filter by tenant slug…"
              aria-label="Filter by tenant slug"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-full sm:w-56 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
          >
            <option value="">All statuses</option>
            {['active', 'trial', 'paused', 'suspended', 'cancelled', 'inactive'].map(s => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 bg-white border border-gray-300">
            <div className="win8-spinner text-brand mx-auto">
              <span /><span /><span /><span /><span />
            </div>
            <p className="mt-3 text-gray-500 text-sm">Loading subscriptions…</p>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white border border-gray-300">No subscriptions found.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                <tr>
                  {['Tenant', 'Plan', 'Status', 'Billing', 'Key Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscriptions.map(sub => (
                  <tr key={sub.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{sub.tenant?.name || '—'}</p>
                      <p className="text-xs text-gray-700 font-mono">{sub.tenant?.slug || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {sub.plan ? (
                        <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${TIER_BADGE[sub.plan.tier] || 'bg-gray-500 text-white'}`}>
                          {sub.plan.name || sub.plan.tier || 'Unknown'}
                        </span>
                      ) : <span className="text-xs text-gray-500">No plan</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[sub.status] || 'bg-gray-500 text-white'}`}>
                        {sub.status || 'Unknown'}
                      </span>
                      {sub.cancellationReason && <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[120px]" title={sub.cancellationReason}>{sub.cancellationReason}</div>}
                      {sub.pauseReason && <div className="text-xs text-win8-info mt-0.5 truncate max-w-[120px]" title={sub.pauseReason}>{sub.pauseReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 capitalize">{sub.billingCycle}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {sub.status === 'trial' ? <><span className="text-gray-500">Trial ends </span>{fmt(sub.trialEndDate)}</> :
                       sub.status === 'paused' && sub.pauseEndsAt ? <><span className="text-gray-500">Resumes </span>{fmt(sub.pauseEndsAt)}</> :
                       sub.status === 'suspended' && sub.gracePeriodEndDate ? <><span className="text-win8-suspended">Grace ends </span>{fmt(sub.gracePeriodEndDate)}</> :
                       fmt(sub.nextBillingDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(['assign-plan', 'extend-trial', 'record-payment'] as ActionType[]).map(action => (
                          <button key={action} onClick={() => openAction(sub, action)} title={ACTION_LABEL[action]} aria-label={ACTION_LABEL[action]}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON[action]} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action={action} />
                          </button>
                        ))}
                        {sub.status !== 'active' && (
                          <button onClick={() => openAction(sub, 'activate')} title={ACTION_LABEL.activate} aria-label={ACTION_LABEL.activate}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON.activate} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action="activate" />
                          </button>
                        )}
                        {sub.status === 'paused' && (
                          <button onClick={() => openAction(sub, 'resume')} title={ACTION_LABEL.resume} aria-label={ACTION_LABEL.resume}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON.resume} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action="resume" />
                          </button>
                        )}
                        {sub.status !== 'paused' && (
                          <button onClick={() => openAction(sub, 'pause')} title={ACTION_LABEL.pause} aria-label={ACTION_LABEL.pause}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON.pause} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action="pause" />
                          </button>
                        )}
                        {sub.status !== 'suspended' && (
                          <button onClick={() => openAction(sub, 'suspend')} title={ACTION_LABEL.suspend} aria-label={ACTION_LABEL.suspend}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON.suspend} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action="suspend" />
                          </button>
                        )}
                        {sub.status !== 'cancelled' && (
                          <button onClick={() => openAction(sub, 'cancel')} title={ACTION_LABEL.cancel} aria-label={ACTION_LABEL.cancel}
                            className={`inline-flex items-center justify-center p-2.5 text-white ${ACTION_BUTTON.cancel} hover:brightness-110 transition-[filter]`}>
                            <ActionIcon action="cancel" />
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

      {/* Action Drawer */}
      <Win8Drawer open={!!actionModal} onClose={() => setActionModal(null)}>
        {displayActionModal && (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <h2 className="text-base font-semibold capitalize">{displayActionModal.action.replace(/-/g, ' ')}</h2>
              <button onClick={() => setActionModal(null)} title="Close" aria-label="Close" className="text-white/70 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <p className="text-sm text-gray-700">Tenant: <span className="font-medium text-gray-900">{displayActionModal.sub.tenant?.name}</span></p>

              {displayActionModal.action === 'assign-plan' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                    <select value={actionPlanId} onChange={e => setActionPlanId(e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900">
                      <option value="">— choose —</option>
                      {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.tier})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Next Billing Date</label>
                    <input type="date" value={actionBillingDate} onChange={e => setActionBillingDate(e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {displayActionModal.action === 'extend-trial' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Extend by (days)</label>
                  <input type="number" min="1" max="365" value={actionDays} onChange={e => setActionDays(e.target.value)}
                    className="w-full border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}

              {displayActionModal.action === 'cancel' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cancellation Reason</label>
                  <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                    placeholder="Optional reason for cancellation…"
                    className="w-full border border-gray-300 px-3 py-2 text-sm resize-none" />
                </div>
              )}

              {displayActionModal.action === 'suspend' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days, optional)</label>
                  <input type="number" min="0" max="90" value={actionGraceDays} onChange={e => setActionGraceDays(e.target.value)}
                    placeholder="0 = no grace period"
                    className="w-full border border-gray-300 px-3 py-2 text-sm" />
                </div>
              )}

              {displayActionModal.action === 'pause' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Pause Reason</label>
                    <input value={actionReason} onChange={e => setActionReason(e.target.value)}
                      placeholder="e.g. Customer requested break"
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Auto-resume after (days, optional)</label>
                    <input type="number" min="1" value={actionDays} onChange={e => setActionDays(e.target.value)}
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {displayActionModal.action === 'record-payment' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱) *</label>
                    <input type="number" min="0" step="0.01" value={actionAmount} onChange={e => setActionAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Transaction ID</label>
                    <input value={actionTxId} onChange={e => setActionTxId(e.target.value)}
                      placeholder="Optional"
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input value={actionReason} onChange={e => setActionReason(e.target.value)}
                      placeholder="Optional notes"
                      className="w-full border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}

              {displayActionModal.action === 'activate' && displayActionModal.sub.status === 'cancelled' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reactivation Reason *</label>
                  <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                    placeholder="Why is this cancelled subscription being reactivated?"
                    className="w-full border border-gray-300 px-3 py-2 text-sm resize-none" />
                </div>
              )}

              {['activate', 'resume'].includes(displayActionModal.action) && displayActionModal.sub.status !== 'cancelled' && (
                <p className="text-sm text-gray-700">Confirm to <strong>{displayActionModal.action}</strong> this subscription?</p>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 border border-gray-300 text-sm hover:bg-gray-100">Cancel</button>
              <button
                onClick={executeAction}
                disabled={
                  actionSaving ||
                  (displayActionModal.action === 'assign-plan' && !actionPlanId) ||
                  (displayActionModal.action === 'record-payment' && !actionAmount) ||
                  (displayActionModal.action === 'activate' && displayActionModal.sub.status === 'cancelled' && !actionReason.trim())
                }
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {actionSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </Win8Drawer>
    </>
  );
}
