'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PageTitle from '@/components/PageTitle';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { getFetchErrorMessage } from '@/lib/fetch-error';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';

type Segment = 'all' | 'new' | 'regular' | 'vip' | 'at_risk' | 'lapsed';
type Channel = 'email' | 'sms';

interface SegmentCounts {
  all: number; new: number; regular: number; vip: number; at_risk: number; lapsed: number; prospect: number;
}

interface CRMCustomer {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  totalSpent?: number;
  loyaltyPointsBalance?: number;
  lastPurchaseDate?: string;
  orderCount: number;
  computedSegment: string;
  tags?: string[];
}

interface Campaign {
  _id: string;
  name: string;
  channel: Channel;
  segment: string;
  subject?: string;
  body: string;
  status: 'draft' | 'sent' | 'failed';
  sentCount?: number;
  sentAt?: string;
  createdAt: string;
}

const SEGMENT_META: Record<string, { label: string; description: string }> = {
  vip:      { label: 'VIP',      description: 'High spend or 500+ points' },
  new:      { label: 'New',      description: 'Joined recently, ≤2 orders' },
  regular:  { label: 'Regular',  description: '3+ orders, steady buyer' },
  at_risk:  { label: 'At Risk',  description: 'No purchase in 30–90 days' },
  lapsed:   { label: 'Lapsed',   description: 'Inactive 90+ days' },
  prospect: { label: 'Prospect', description: 'No purchases yet' },
};

/** Solid badge fill per segment. */
const SEGMENT_BADGE: Record<string, string> = {
  vip: 'bg-win8-warning text-white',
  new: 'bg-brand text-white',
  regular: 'bg-win8-success text-white',
  at_risk: 'bg-win8-suspended text-white',
  lapsed: 'bg-win8-danger text-white',
  prospect: 'bg-gray-500 text-white',
};

/** Count color on the segment tiles. */
const SEGMENT_TEXT: Record<string, string> = {
  all: 'text-gray-900',
  vip: 'text-win8-warning',
  new: 'text-brand',
  regular: 'text-win8-success',
  at_risk: 'text-win8-suspended',
  lapsed: 'text-win8-danger',
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-500 text-white',
  sent: 'bg-win8-info text-white',
  failed: 'bg-win8-danger text-white',
};

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const EMPTY_FORM = { name: '', channel: 'email' as Channel, segment: 'all' as Segment, subject: '', body: '' };

export default function CRMPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { canAccess } = usePermissions();
  const canCreate = canAccess('crm.create');
  const canSend = canAccess('crm.send');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const [counts, setCounts] = useState<SegmentCounts | null>(null);
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [segmentTotal, setSegmentTotal] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CRMCustomer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  // Campaign compose form
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSegments = useCallback(async (seg: Segment) => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/crm/segments?tenant=${tenant}&segment=${seg}&limit=30`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCounts(data.data.counts);
        setCustomers(data.data.customers);
        setSegmentTotal(typeof data.data.total === 'number' ? data.data.total : data.data.customers.length);
        setCustomersError(null);
      } else {
        setCustomersError(data.error || 'Failed to load customer segments');
      }
    } catch (err) {
      setCustomersError(getFetchErrorMessage(err, 'Failed to load customer segments'));
    } finally {
      setLoadingCustomers(false);
    }
  }, [tenant]);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch(`/api/crm/campaigns?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data);
        setCampaignsError(null);
      } else {
        setCampaignsError(data.error || 'Failed to load campaigns');
      }
    } catch (err) {
      setCampaignsError(getFetchErrorMessage(err, 'Failed to load campaigns'));
    } finally {
      setLoadingCampaigns(false);
    }
  }, [tenant]);

  useEffect(() => { fetchSegments(selectedSegment); }, [selectedSegment, fetchSegments]);
  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const openCompose = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCompose(true);
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.body.trim()) {
      setFormError(dict?.crm?.nameBodyRequired || 'Name and body are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/campaigns?tenant=${tenant}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.crm?.campaignSavedAsDraft || 'Campaign saved as draft');
        setCampaigns((prev) => [data.data, ...prev]);
        setShowCompose(false);
      } else {
        setFormError(data.error || dict?.crm?.failedToSaveCampaign || 'Failed to save campaign');
      }
    } catch {
      setFormError(dict?.crm?.failedToSaveCampaign || 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  const segmentOrder: Segment[] = ['all', 'vip', 'new', 'regular', 'at_risk', 'lapsed'];

  // Translated segment metadata (computed from dict so labels update on language change)
  const segmentMeta: Record<string, { label: string; description: string }> = {
    all:      { label: dict?.crm?.allCustomers || 'All Customers', description: dict?.crm?.allCustomersDesc || 'Every active customer' },
    vip:      { label: dict?.crm?.segmentVip || SEGMENT_META.vip.label,           description: dict?.crm?.segmentVipDesc || SEGMENT_META.vip.description },
    new:      { label: dict?.crm?.segmentNew || SEGMENT_META.new.label,           description: dict?.crm?.segmentNewDesc || SEGMENT_META.new.description },
    regular:  { label: dict?.crm?.segmentRegular || SEGMENT_META.regular.label,   description: dict?.crm?.segmentRegularDesc || SEGMENT_META.regular.description },
    at_risk:  { label: dict?.crm?.segmentAtRisk || SEGMENT_META.at_risk.label,    description: dict?.crm?.segmentAtRiskDesc || SEGMENT_META.at_risk.description },
    lapsed:   { label: dict?.crm?.segmentLapsed || SEGMENT_META.lapsed.label,     description: dict?.crm?.segmentLapsedDesc || SEGMENT_META.lapsed.description },
    prospect: { label: dict?.crm?.segmentProspect || SEGMENT_META.prospect.label, description: dict?.crm?.segmentProspectDesc || SEGMENT_META.prospect.description },
  };
  const segmentLabel = (seg: string) => segmentMeta[seg]?.label ?? seg;
  const segmentCount = (seg: string) => (counts ? counts[seg as keyof SegmentCounts] : undefined);

  const statusLabel: Record<string, string> = {
    draft: dict?.crm?.statusDraft || 'Draft',
    sent: dict?.crm?.statusSent || 'Sent',
    failed: dict?.crm?.statusFailed || 'Failed',
  };
  const channelLabel = (ch: Channel) => (ch === 'email' ? (dict?.crm?.channelEmail || 'Email') : (dict?.crm?.channelSms || 'SMS'));
  const noContact = dict?.crm?.noContact || 'No contact';

  const handleSend = async (campaign: Campaign) => {
    // Sending messages real customers and cannot be recalled, so always confirm.
    const count = segmentCount(campaign.segment);
    const message = (dict?.crm?.confirmSend || 'Send campaign "{name}" to {segment} ({count} customers)? This cannot be undone.')
      .replace('{name}', campaign.name)
      .replace('{segment}', segmentLabel(campaign.segment))
      .replace('{count}', count != null ? count.toLocaleString() : '—');
    if (!confirm(message)) return;

    setSending(campaign._id);
    try {
      const res = await fetch(`/api/crm/campaigns/${campaign._id}/send?tenant=${tenant}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast.success((dict?.crm?.sentToCustomers || 'Sent to {count} customers').replace('{count}', data.data.sentCount));
        setCampaigns((prev) => prev.map((c) => c._id === campaign._id ? { ...c, status: 'sent', sentCount: data.data.sentCount, sentAt: new Date().toISOString() } : c));
      } else {
        showToast.error(data.error || dict?.crm?.sendFailed || 'Send failed');
      }
    } catch { showToast.error(dict?.crm?.sendFailed || 'Send failed'); } finally { setSending(null); }
  };

  const initials = (c: CRMCustomer) => `${c.firstName?.[0] ?? ''}${c.lastName?.[0] ?? ''}`.toUpperCase();

  const renderCustomers = () => {
    if (loadingCustomers && customers.length === 0) {
      return (
        <div className="text-center py-12">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict?.crm?.loadingCustomers || 'Loading customers…'}</p>
        </div>
      );
    }

    if (customersError) {
      return (
        <div className="text-center py-12">
          <p className="text-win8-danger text-sm font-medium">{dict?.crm?.failedToLoadSegments || 'Failed to load customer segments'}</p>
          <p className="text-xs text-gray-500 mt-1">{customersError}</p>
          <button
            type="button"
            onClick={() => fetchSegments(selectedSegment)}
            disabled={loadingCustomers}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (customers.length === 0) {
      return <p className="px-4 py-12 text-center text-gray-400 text-sm">{dict?.crm?.noCustomersInSegment || 'No customers in this segment'}</p>;
    }

    return (
      <div className="relative" aria-busy={loadingCustomers}>
        {loadingCustomers && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10" aria-live="polite">{SPINNER}</div>
        )}
        <ul className="divide-y divide-gray-200 max-h-[70vh] overflow-y-auto">
          {customers.map((c) => {
            const selected = selectedCustomer?._id === c._id;
            return (
              <li key={c._id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedCustomer(selected ? null : c)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${selected ? 'bg-brand-soft' : 'hover:bg-gray-100'}`}
                >
                  <span className="w-8 h-8 flex items-center justify-center shrink-0 bg-brand text-white text-xs font-bold" aria-hidden="true">
                    {initials(c)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</span>
                    <span className="block text-xs text-gray-500 truncate">{c.email || c.phone || noContact}</span>
                  </span>
                  <span className="shrink-0 text-right space-y-1">
                    <span className="block text-xs font-semibold text-gray-700 tabular-nums"><Currency amount={c.totalSpent ?? 0} /></span>
                    <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 ${SEGMENT_BADGE[c.computedSegment] || 'bg-gray-500 text-white'}`}>
                      {segmentLabel(c.computedSegment)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderCampaigns = () => {
    if (loadingCampaigns) {
      return (
        <div className="px-4 py-8 text-center">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict?.crm?.loadingCampaigns || 'Loading campaigns…'}</p>
        </div>
      );
    }

    if (campaignsError) {
      return (
        <div className="px-4 py-8 text-center">
          <p className="text-win8-danger text-sm font-medium">{dict?.crm?.failedToLoadCampaigns || 'Failed to load campaigns'}</p>
          <p className="text-xs text-gray-500 mt-1">{campaignsError}</p>
          <button
            type="button"
            onClick={() => fetchCampaigns()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (campaigns.length === 0) {
      return <p className="px-4 py-8 text-center text-sm text-gray-400">{dict?.crm?.noCampaignsYet || 'No campaigns yet'}</p>;
    }

    return (
      <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {campaigns.map((c) => {
          const isSending = sending === c._id;
          return (
            <li key={c._id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" title={c.name}>{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {channelLabel(c.channel)} · {segmentLabel(c.segment)}
                    {c.sentCount != null && c.sentCount > 0 && (
                      <> · <span className="tabular-nums">{(dict?.crm?.sentCount || '{count} sent').replace('{count}', c.sentCount.toLocaleString())}</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 ${STATUS_BADGE[c.status] || 'bg-gray-500 text-white'}`}>
                    {statusLabel[c.status] ?? c.status}
                  </span>
                  {canSend && c.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleSend(c)}
                      disabled={isSending}
                      aria-label={`${dict?.crm?.send || 'Send'}: ${c.name}`}
                      className="px-3 py-1 text-xs font-semibold bg-brand text-white hover:brightness-110 disabled:opacity-50 transition-[filter]"
                    >
                      {isSending ? (dict?.crm?.sending || 'Sending…') : (dict?.crm?.send || 'Send')}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  const closeLabel = dict?.common?.close || 'Close';

  return (
    <>
      <PageTitle />
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict?.crm?.title || 'CRM'}
          description={dict?.crm?.subtitle || 'Segment customers and send targeted campaigns'}
          actions={canCreate && (
            <button
              type="button"
              onClick={openCompose}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
            >
              + {dict?.crm?.newCampaign || 'New Campaign'}
            </button>
          )}
        />

        <div className="space-y-6">
          {/* Segment tiles double as the list filter */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" role="group" aria-label={dict?.crm?.filterBySegment || 'Filter by segment'}>
            {segmentOrder.map((seg) => {
              const meta = segmentMeta[seg];
              const count = segmentCount(seg);
              const selected = selectedSegment === seg;
              return (
                <button
                  key={seg}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedSegment(seg)}
                  className={`text-left p-4 border transition-colors ${
                    selected ? 'bg-brand-soft border-brand' : 'bg-white border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <span className={`block text-2xl font-bold tabular-nums ${SEGMENT_TEXT[seg]}`}>
                    {count != null ? count.toLocaleString() : '—'}
                  </span>
                  <span className="block text-sm font-semibold text-gray-900 mt-0.5">{meta.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-tight">{meta.description}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Customer list */}
            <section className="lg:col-span-2 bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-300 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-gray-900">
                  {selectedSegment !== 'all'
                    ? `${segmentLabel(selectedSegment)} · ${dict?.crm?.customers || 'Customers'}`
                    : (dict?.crm?.allCustomers || 'All Customers')}
                </h2>
                {!customersError && customers.length > 0 && (
                  <span className="text-xs text-gray-500 tabular-nums">
                    {customers.length < segmentTotal
                      ? `${dict?.admin?.showing || 'Showing'} ${customers.length.toLocaleString()} ${dict?.admin?.of || 'of'} ${segmentTotal.toLocaleString()}`
                      : `${customers.length.toLocaleString()} ${dict?.crm?.shown || 'shown'}`}
                  </span>
                )}
              </div>
              {renderCustomers()}
            </section>

            {/* Right column — customer mini-profile and campaign list */}
            <div className="space-y-6">
              {selectedCustomer && (
                <section className="bg-white border border-gray-300">
                  <div className="px-4 py-3 border-b border-gray-300 flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-900">{dict?.crm?.customerProfile || 'Customer Profile'}</h2>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      title={closeLabel}
                      aria-label={closeLabel}
                      className="inline-flex items-center justify-center text-gray-500 hover:text-gray-900"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="w-12 h-12 flex items-center justify-center shrink-0 bg-brand text-white font-bold text-lg" aria-hidden="true">
                        {initials(selectedCustomer)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                        <p className="text-xs text-gray-500 truncate">{selectedCustomer.email || selectedCustomer.phone || noContact}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: dict?.crm?.orders || 'Orders', value: selectedCustomer.orderCount.toLocaleString() },
                        { label: dict?.crm?.totalSpent || 'Total Spent', value: <Currency amount={selectedCustomer.totalSpent ?? 0} /> },
                        { label: dict?.loyalty?.points || 'Points', value: (selectedCustomer.loyaltyPointsBalance ?? 0).toLocaleString() },
                        { label: dict?.crm?.segment || 'Segment', value: segmentLabel(selectedCustomer.computedSegment) },
                      ].map(({ label, value }) => (
                        <div key={label} className="border border-gray-300 p-2.5">
                          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                          <p className="text-sm font-semibold text-gray-900 mt-0.5 tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                    {selectedCustomer.lastPurchaseDate && (
                      <p className="text-xs text-gray-500">
                        {dict?.crm?.lastPurchase || 'Last purchase:'}{' '}
                        <span className="tabular-nums">{new Date(selectedCustomer.lastPurchaseDate).toLocaleDateString(lang === 'es' ? 'es' : 'en')}</span>
                      </p>
                    )}
                    {selectedCustomer.tags && selectedCustomer.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedCustomer.tags.map((t) => (
                          <span key={t} className="text-xs px-1.5 py-0.5 bg-gray-100 border border-gray-300 text-gray-700">{t}</span>
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/${tenant}/${lang}/admin/customers`}
                      className="flex items-center justify-center w-full px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                    >
                      {dict?.crm?.viewFullProfile || 'View full profile →'}
                    </Link>
                  </div>
                </section>
              )}

              <section className="bg-white border border-gray-300">
                <div className="px-4 py-3 border-b border-gray-300">
                  <h2 className="text-base font-bold text-gray-900">{dict?.crm?.recentCampaigns || 'Recent Campaigns'}</h2>
                </div>
                {renderCampaigns()}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Compose campaign */}
      <Win8Drawer open={showCompose && canCreate} onClose={() => setShowCompose(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{dict?.crm?.newCampaign || 'New Campaign'}</h2>
          <button
            type="button"
            onClick={() => setShowCompose(false)}
            title={closeLabel}
            aria-label={closeLabel}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleCreateCampaign} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label htmlFor="campaign-name" className={LABEL}>
                {dict?.crm?.campaignName || 'Campaign Name'} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="campaign-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT}
                placeholder={dict?.crm?.campaignNamePlaceholder || 'e.g. VIP Exclusive Offer'}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span id="campaign-channel-label" className={LABEL}>{dict?.crm?.channel || 'Channel'}</span>
                <div className="grid grid-cols-2" role="group" aria-labelledby="campaign-channel-label">
                  {(['email', 'sms'] as Channel[]).map((ch) => {
                    const active = form.channel === ch;
                    return (
                      <button
                        key={ch}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setForm((f) => ({ ...f, channel: ch }))}
                        className={`px-3 py-2 text-sm font-medium border transition-colors ${
                          active ? 'bg-brand text-white border-brand' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {channelLabel(ch)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="campaign-segment" className={LABEL}>{dict?.crm?.targetSegment || 'Target Segment'}</label>
                <select
                  id="campaign-segment"
                  value={form.segment}
                  onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as Segment }))}
                  className={INPUT}
                >
                  {segmentOrder.map((seg) => (
                    <option key={seg} value={seg}>
                      {segmentLabel(seg)} ({(segmentCount(seg) ?? 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.channel === 'email' && (
              <div>
                <label htmlFor="campaign-subject" className={LABEL}>{dict?.crm?.subject || 'Subject'}</label>
                <input
                  id="campaign-subject"
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className={INPUT}
                  placeholder={dict?.crm?.subjectPlaceholder || "We miss you! Here's 10% off..."}
                />
              </div>
            )}
            <div>
              <label htmlFor="campaign-body" className={LABEL}>
                {dict?.crm?.message || 'Message'} <span className="text-win8-danger">*</span>{' '}
                {form.channel === 'sms' && <span className="text-gray-400 font-normal">{dict?.crm?.smsCharLimit || '(160 char limit for single SMS)'}</span>}
              </label>
              <textarea
                id="campaign-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={6}
                className={`${INPUT} resize-none`}
                placeholder={dict?.crm?.messagePlaceholder || 'Hi {firstName}, we have something special for you...'}
              />
              <div className="flex items-start justify-between gap-3 mt-1">
                <p className="text-xs text-gray-400">{dict?.crm?.personalizationHint || 'Use {firstName} as a personalization token'}</p>
                {form.channel === 'sms' && (
                  <span className={`text-xs tabular-nums shrink-0 ${form.body.length > 160 ? 'font-semibold text-win8-warning' : 'text-gray-400'}`}>
                    {form.body.length}/160
                  </span>
                )}
              </div>
            </div>
            {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowCompose(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict?.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {saving ? (dict?.common?.saving || 'Saving…') : (dict?.crm?.saveDraft || 'Save Draft')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
