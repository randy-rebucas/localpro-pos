'use client';

import { useEffect, useState, useCallback } from 'react';
import { Ban, Banknote, CalendarCog, CalendarPlus, CircleX, ClipboardList, CreditCard, Hourglass, Pause, Play, Power } from 'lucide-react';
import { showToast } from '@/lib/toast';
import {
  CHECKBOX, CHECK_ROW, DARK_FIELD, DARK_LABEL, Empty, HINT, INPUT, IconKey, KEY, KEY_DANGER, KEY_PRIMARY,
  LABEL, LedReadout, LedStat, Printing, SaPage, SELECT, Sheet, Slip, TABLE, TBODY, TD, TD_TEXT, TEXTAREA, TH, THEAD, TR,
  Tag, statusTone, type TagTone,
} from '@/components/super-admin/ui';

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
  paymentOverdue?: boolean;
  deactivatedAt?: string;
}

type ActionType = 'assign-plan' | 'extend-trial' | 'cancel' | 'activate' | 'suspend' | 'pause' | 'resume' | 'record-payment' | 'adjust-billing-date' | 'extend-grace';

const ACTION_TITLE: Partial<Record<ActionType, string>> = {
  'adjust-billing-date': 'Adjust billing date',
  'extend-grace': 'Extend grace period',
};

// Mirrors DEACTIVATION_BUFFER_DAYS in lib/automations/subscription-billing.ts
const DEACTIVATION_BUFFER_DAYS = 3;

// yyyy-mm-dd in local time, for <input type="date">
const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Plan tiers as boxed codes; the plan name carries the meaning. */
const TIER_TONE: Record<string, TagTone> = {
  starter: 'muted',
  pro: 'ok',
  business: 'info',
  enterprise: 'info',
};

/** Subscription states that statusTone doesn't place the way this page needs. */
const subTone = (status: string): TagTone => (status === 'paused' ? 'info' : status === 'trial' ? 'warn' : statusTone(status));

const FIELD_ID = 'sub-action';

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
  const [actionNotify, setActionNotify] = useState(true);
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
    setActionNotify(true);
    if (action === 'extend-grace') {
      // Default: one week past the current grace end (or from today if that's passed)
      const base = sub.gracePeriodEndDate && new Date(sub.gracePeriodEndDate) > new Date() ? new Date(sub.gracePeriodEndDate) : new Date();
      base.setDate(base.getDate() + 7);
      setActionBillingDate(toDateInput(base));
    } else if (action === 'adjust-billing-date' && sub.nextBillingDate) {
      setActionBillingDate(toDateInput(new Date(sub.nextBillingDate)));
    } else {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      setActionBillingDate(toDateInput(d));
    }
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
    if (action === 'activate' && sub.status === 'cancelled') body.reactivationReason = actionReason;
    if (action === 'adjust-billing-date') { body.nextBillingDate = actionBillingDate; body.reason = actionReason; body.notifyTenant = actionNotify; }
    if (action === 'extend-grace') { body.gracePeriodEndDate = actionBillingDate; body.reason = actionReason; body.notifyTenant = actionNotify; }

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

  const keyDate = (sub: Subscription) =>
    sub.status === 'trial' ? <><span className="text-ink/50">Trial ends </span>{fmt(sub.trialEndDate)}</> :
    sub.status === 'paused' && sub.pauseEndsAt ? <><span className="text-ink/50">Resumes </span>{fmt(sub.pauseEndsAt)}</> :
    sub.status === 'suspended' && sub.gracePeriodEndDate ? <><span className="text-[#8a5a12]">Grace ends </span>{fmt(sub.gracePeriodEndDate)}</> :
    sub.paymentOverdue && sub.gracePeriodEndDate ? <><span className="text-stamp">Overdue · grace ends </span>{fmt(sub.gracePeriodEndDate)}</> :
    fmt(sub.nextBillingDate);

  const planTag = (sub: Subscription) =>
    sub.planId ? <Tag tone={TIER_TONE[sub.planId.tier] || 'muted'}>{sub.planId.name}</Tag> : <span className="font-receipt text-xs text-ink/50">No plan</span>;

  const statusBlock = (sub: Subscription) => (
    <>
      <Tag tone={subTone(sub.status)}>{sub.status}</Tag>
      {sub.cancellationReason && <div className="mt-1 max-w-[160px] truncate text-xs text-ink/60" title={sub.cancellationReason}>{sub.cancellationReason}</div>}
      {sub.pauseReason && <div className="mt-1 max-w-[160px] truncate text-xs text-brand-navy" title={sub.pauseReason}>{sub.pauseReason}</div>}
    </>
  );

  const actionKeys = (sub: Subscription) => {
    const who = sub.tenantId?.name || 'this store';
    return (
      <div className="flex flex-wrap gap-1.5">
        <IconKey icon={ClipboardList} label={`Assign a plan to ${who}`} onClick={() => openAction(sub, 'assign-plan')} />
        <IconKey icon={CalendarPlus} label={`Extend the trial for ${who}`} onClick={() => openAction(sub, 'extend-trial')} />
        <IconKey icon={Banknote} label={`Record a payment for ${who}`} onClick={() => openAction(sub, 'record-payment')} />
        {['active', 'paused'].includes(sub.status) && !sub.paymentOverdue && (
          <IconKey icon={CalendarCog} label={`Change the billing date for ${who}`} onClick={() => openAction(sub, 'adjust-billing-date')} />
        )}
        {sub.status === 'active' && sub.paymentOverdue && !sub.deactivatedAt && (
          <IconKey icon={Hourglass} label={`Extend the grace period for ${who}`} onClick={() => openAction(sub, 'extend-grace')} />
        )}
        {sub.status !== 'active' && <IconKey icon={Power} label={`Activate ${who}`} onClick={() => openAction(sub, 'activate')} />}
        {sub.status === 'paused' && <IconKey icon={Play} label={`Resume ${who}`} onClick={() => openAction(sub, 'resume')} />}
        {!['paused'].includes(sub.status) && <IconKey icon={Pause} label={`Pause ${who}`} onClick={() => openAction(sub, 'pause')} />}
        {sub.status !== 'suspended' && <IconKey icon={Ban} tone="danger" label={`Suspend ${who}`} onClick={() => openAction(sub, 'suspend')} />}
        {sub.status !== 'cancelled' && <IconKey icon={CircleX} tone="danger" label={`Cancel the subscription for ${who}`} onClick={() => openAction(sub, 'cancel')} />}
      </div>
    );
  };

  const confirmDisabled = !!actionModal && (
    actionSaving ||
    (actionModal.action === 'assign-plan' && !actionPlanId) ||
    (actionModal.action === 'record-payment' && !actionAmount) ||
    (actionModal.action === 'adjust-billing-date' && !actionBillingDate) ||
    (actionModal.action === 'extend-grace' && (!actionBillingDate || !actionReason.trim())) ||
    (actionModal.action === 'activate' && actionModal.sub.status === 'cancelled' && !actionReason.trim())
  );

  const counts = {
    active: subscriptions.filter(s => s.status === 'active').length,
    trial: subscriptions.filter(s => s.status === 'trial').length,
    overdue: subscriptions.filter(s => s.paymentOverdue).length,
  };

  return (
    <SaPage
      tagNo="05"
      tag="Standing orders"
      title="Subscriptions"
      subtitle="Every store's plan, where its bill stands, and the keys to change it."
      side={!loading && <LedReadout value={subscriptions.length} label="Listed" />}
    >
      {/* Filters */}
      <section aria-label="Filters" className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,12rem)]">
        <div>
          <label htmlFor="sub-search" className={DARK_LABEL}>Tenant slug</label>
          <input
            id="sub-search"
            type="text"
            placeholder="Filter by tenant slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${DARK_FIELD} placeholder:text-ink/40`}
          />
        </div>
        <div>
          <label htmlFor="sub-status" className={DARK_LABEL}>Status</label>
          <select id="sub-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={DARK_FIELD}>
            <option value="">All statuses</option>
            {['active', 'trial', 'paused', 'suspended', 'cancelled', 'inactive'].map(s => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        </div>
      </section>

      {!loading && subscriptions.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LedStat label="Active (listed)" value={counts.active} />
          <LedStat label="On trial (listed)" value={counts.trial} />
          <LedStat label="Payment overdue (listed)" value={counts.overdue} tone={counts.overdue > 0 ? 'alert' : 'default'} />
        </div>
      )}

      <Slip title="Subscription roll" className="mt-6">
        <div aria-busy={loading}>
          {loading ? (
            <Printing label="Loading subscriptions…" />
          ) : subscriptions.length === 0 ? (
            <Empty icon={<CreditCard className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>No subscriptions found.</Empty>
          ) : (
            <>
              {/* Below xl: one printed block per store */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {subscriptions.map(sub => (
                  <li key={sub._id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{sub.tenantId?.name || '—'}</p>
                        <p className="font-receipt text-xs text-ink/60">{sub.tenantId?.slug || '—'}</p>
                      </div>
                      <div className="text-right">{statusBlock(sub)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/70">
                      {planTag(sub)}
                      <span className="capitalize">{sub.billingCycle}</span>
                      <span>{keyDate(sub)}</span>
                    </div>
                    <div className="mt-3">{actionKeys(sub)}</div>
                  </li>
                ))}
              </ul>

              {/* From xl: the full roll */}
              <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Subscriptions" tabIndex={0}>
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      {['Tenant', 'Plan', 'Status', 'Billing', 'Key date', 'Actions'].map(h => (
                        <th key={h} scope="col" className={TH}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {subscriptions.map(sub => (
                      <tr key={sub._id} className={TR}>
                        <td className={TD_TEXT}>
                          <p className="font-medium">{sub.tenantId?.name || '—'}</p>
                          <p className="font-receipt text-xs text-ink/60">{sub.tenantId?.slug || '—'}</p>
                        </td>
                        <td className={TD}>{planTag(sub)}</td>
                        <td className={TD}>{statusBlock(sub)}</td>
                        <td className={`${TD} capitalize text-ink/70`}>{sub.billingCycle}</td>
                        <td className={`${TD} whitespace-nowrap text-xs text-ink/70`}>{keyDate(sub)}</td>
                        <td className="px-4 py-2.5">{actionKeys(sub)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Slip>

      {/* Action sheet */}
      {actionModal && (
        <Sheet
          title={ACTION_TITLE[actionModal.action] || actionModal.action.replace(/-/g, ' ')}
          subtitle={<>Tenant: <span className="font-medium text-ink">{actionModal.sub.tenantId?.name}</span></>}
          onClose={() => setActionModal(null)}
          closeLabel="Close"
          footer={
            <>
              <button type="button" onClick={() => setActionModal(null)} className={KEY}>Cancel</button>
              <button
                type="button"
                onClick={executeAction}
                disabled={confirmDisabled}
                className={actionModal.action === 'cancel' || actionModal.action === 'suspend' ? KEY_DANGER : KEY_PRIMARY}
              >
                {actionSaving ? 'Saving…' : 'Confirm'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {actionModal.action === 'assign-plan' && (
              <>
                <div>
                  <label htmlFor={`${FIELD_ID}-plan`} className={LABEL}>Plan</label>
                  <select id={`${FIELD_ID}-plan`} value={actionPlanId} onChange={e => setActionPlanId(e.target.value)} className={`${SELECT} w-full`}>
                    <option value="">— choose —</option>
                    {plans.map(p => <option key={p._id} value={p._id}>{p.name} ({p.tier})</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-date`} className={LABEL}>Next billing date</label>
                  <input id={`${FIELD_ID}-date`} type="date" value={actionBillingDate} onChange={e => setActionBillingDate(e.target.value)} className={INPUT} />
                </div>
              </>
            )}

            {actionModal.action === 'extend-trial' && (
              <div>
                <label htmlFor={`${FIELD_ID}-days`} className={LABEL}>Extend by (days)</label>
                <input id={`${FIELD_ID}-days`} type="number" min="1" max="365" value={actionDays} onChange={e => setActionDays(e.target.value)} className={INPUT} />
              </div>
            )}

            {actionModal.action === 'cancel' && (
              <div>
                <label htmlFor={`${FIELD_ID}-reason`} className={LABEL}>Cancellation reason</label>
                <textarea id={`${FIELD_ID}-reason`} value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                  placeholder="Optional reason for cancellation…"
                  className={`${TEXTAREA} resize-none`} />
              </div>
            )}

            {actionModal.action === 'suspend' && (
              <div>
                <label htmlFor={`${FIELD_ID}-grace`} className={LABEL}>Grace period (days, optional)</label>
                <input id={`${FIELD_ID}-grace`} type="number" min="0" max="90" value={actionGraceDays} onChange={e => setActionGraceDays(e.target.value)}
                  placeholder="0 = no grace period" className={INPUT} />
              </div>
            )}

            {actionModal.action === 'pause' && (
              <>
                <div>
                  <label htmlFor={`${FIELD_ID}-reason`} className={LABEL}>Pause reason</label>
                  <input id={`${FIELD_ID}-reason`} value={actionReason} onChange={e => setActionReason(e.target.value)}
                    placeholder="e.g. Customer requested break" className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-days`} className={LABEL}>Auto-resume after (days, optional)</label>
                  <input id={`${FIELD_ID}-days`} type="number" min="1" value={actionDays} onChange={e => setActionDays(e.target.value)} className={INPUT} />
                </div>
              </>
            )}

            {actionModal.action === 'record-payment' && (
              <>
                <div>
                  <label htmlFor={`${FIELD_ID}-amount`} className={LABEL}>Amount (₱) *</label>
                  <input id={`${FIELD_ID}-amount`} type="number" min="0" step="0.01" value={actionAmount} onChange={e => setActionAmount(e.target.value)}
                    placeholder="0.00" className={`${INPUT} font-receipt`} />
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-tx`} className={LABEL}>Transaction ID</label>
                  <input id={`${FIELD_ID}-tx`} value={actionTxId} onChange={e => setActionTxId(e.target.value)} placeholder="Optional" className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-notes`} className={LABEL}>Notes</label>
                  <input id={`${FIELD_ID}-notes`} value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="Optional notes" className={INPUT} />
                </div>
              </>
            )}

            {actionModal.action === 'adjust-billing-date' && (
              <>
                <p className="font-receipt text-sm text-ink/70">Current: <span className="font-semibold text-ink">{fmt(actionModal.sub.nextBillingDate)}</span></p>
                <div>
                  <label htmlFor={`${FIELD_ID}-date`} className={LABEL}>New billing date *</label>
                  <input id={`${FIELD_ID}-date`} type="date" value={actionBillingDate} onChange={e => setActionBillingDate(e.target.value)}
                    min={toDateInput(new Date(Date.now() + 86_400_000))} className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-reason`} className={LABEL}>Reason</label>
                  <input id={`${FIELD_ID}-reason`} value={actionReason} onChange={e => setActionReason(e.target.value)}
                    placeholder="e.g. Align with customer's payroll date" className={INPUT} />
                </div>
                <p className={HINT}>Future cycles continue from the new date. No charge is made or prorated.</p>
              </>
            )}

            {actionModal.action === 'extend-grace' && (
              <>
                <p className="font-receipt text-sm text-ink/70">
                  Due: <span className="font-semibold text-ink">{fmt(actionModal.sub.nextBillingDate)}</span>
                  {' · '}Grace ends: <span className="font-semibold text-ink">{fmt(actionModal.sub.gracePeriodEndDate)}</span>
                </p>
                <div>
                  <label htmlFor={`${FIELD_ID}-date`} className={LABEL}>New grace period end *</label>
                  <input id={`${FIELD_ID}-date`} type="date" value={actionBillingDate} onChange={e => setActionBillingDate(e.target.value)}
                    min={toDateInput(new Date(Date.now() + 86_400_000))}
                    max={toDateInput(new Date(Date.now() + 60 * 86_400_000))}
                    className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`${FIELD_ID}-reason`} className={LABEL}>Reason *</label>
                  <input id={`${FIELD_ID}-reason`} value={actionReason} onChange={e => setActionReason(e.target.value)}
                    placeholder="e.g. Customer promised payment on the 20th" className={INPUT} />
                </div>
                {actionBillingDate && (
                  <p className={HINT}>
                    Deactivates on {fmt(new Date(new Date(actionBillingDate).getTime() + DEACTIVATION_BUFFER_DAYS * 86_400_000).toISOString())} if still unpaid.
                    Late fee (day 15) and reactivation fee (day 30) still count from the original due date.
                  </p>
                )}
              </>
            )}

            {(actionModal.action === 'adjust-billing-date' || actionModal.action === 'extend-grace') && (
              <label className={CHECK_ROW}>
                <input type="checkbox" className={CHECKBOX} checked={actionNotify} onChange={e => setActionNotify(e.target.checked)} />
                Email the store about this change
              </label>
            )}

            {actionModal.action === 'activate' && actionModal.sub.status === 'cancelled' && (
              <div>
                <label htmlFor={`${FIELD_ID}-reason`} className={LABEL}>Reactivation reason *</label>
                <textarea id={`${FIELD_ID}-reason`} value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                  placeholder="Why is this cancelled subscription being reactivated?"
                  className={`${TEXTAREA} resize-none`} />
              </div>
            )}

            {['activate', 'resume'].includes(actionModal.action) && actionModal.sub.status !== 'cancelled' && (
              <p className="text-sm text-ink/80">Confirm to <strong>{actionModal.action}</strong> this subscription?</p>
            )}
          </div>
        </Sheet>
      )}
    </SaPage>
  );
}
