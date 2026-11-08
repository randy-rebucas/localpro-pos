'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, MessageSquare, Plus, Send, Users } from 'lucide-react';
import PageTitle from '@/components/PageTitle';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import { DARK_KEY_PRIMARY, HINT, ICON, INPUT, KEY, KEY_PRIMARY, LABEL, RegisterPage, Sheet } from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getDictionaryClient } from '../../dictionaries-client';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/formatting';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any
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

const SEGMENT_ORDER: Segment[] = ['all', 'vip', 'new', 'regular', 'at_risk', 'lapsed'];
const EMPTY_FORM = { name: '', channel: 'email' as Channel, segment: 'all' as Segment, subject: '', body: '' };

/** Segment names and the rule behind each, in the page language. */
const segmentText = (dict: Dict, segment: string): { label: string; description: string } => {
  const text: Record<string, { label: string; description: string }> = {
    all: { label: dict?.crm?.allCustomers || 'All Customers', description: dict?.crm?.allCustomersDesc || 'Every active customer' },
    vip: { label: dict?.crm?.segmentVip || 'VIP', description: dict?.crm?.segmentVipDesc || 'High spend or 500+ points' },
    new: { label: dict?.crm?.segmentNew || 'New', description: dict?.crm?.segmentNewDesc || 'Joined recently, ≤2 orders' },
    regular: { label: dict?.crm?.segmentRegular || 'Regular', description: dict?.crm?.segmentRegularDesc || '3+ orders, steady buyer' },
    at_risk: { label: dict?.crm?.segmentAtRisk || 'At Risk', description: dict?.crm?.segmentAtRiskDesc || 'No purchase in 30–90 days' },
    lapsed: { label: dict?.crm?.segmentLapsed || 'Lapsed', description: dict?.crm?.segmentLapsedDesc || 'Inactive 90+ days' },
    prospect: { label: dict?.crm?.segmentProspect || 'Prospect', description: dict?.crm?.segmentProspectDesc || 'No purchases yet' },
  };
  return text[segment] || { label: segment, description: '' };
};

/** Segments that need attention print in stamp red; the rest stay plain. */
function SegmentTag({ dict, segment }: { dict: Dict; segment: string }) {
  const warn = segment === 'at_risk' || segment === 'lapsed';
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${warn ? 'border-stamp/50 text-stamp' : segment === 'vip' ? 'border-ink bg-ink text-paper-white' : 'border-ink/25 text-ink/70'}`}>
      {segmentText(dict, segment).label}
    </span>
  );
}

function StatusTag({ dict, status }: { dict: Dict; status: Campaign['status'] }) {
  const label = { draft: dict?.crm?.statusDraft || 'Draft', sent: dict?.crm?.statusSent || 'Sent', failed: dict?.crm?.statusFailed || 'Failed' }[status];
  const tone = status === 'failed' ? 'border-stamp/50 text-stamp' : status === 'sent' ? 'border-brand-hover text-brand-hover' : 'border-ink/25 text-ink/70';
  return <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${tone}`}>{label}</span>;
}

const channelLabel = (dict: Dict, channel: Channel) =>
  channel === 'email' ? (dict?.crm?.channelEmail || 'Email') : (dict?.crm?.channelSms || 'SMS');

export default function CRMPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const { canAccess } = usePermissions();
  const canManage = canAccess('crm.manage');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const [counts, setCounts] = useState<SegmentCounts | null>(null);
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CRMCustomer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  // Campaign compose form
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchSegments = useCallback(async (seg: Segment) => {
    setLoadingCustomers(true);
    try {
      const res = await fetch(`/api/crm/segments?tenant=${tenant}&segment=${seg}&limit=30`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCounts(data.data.counts);
        setCustomers(data.data.customers);
      }
    } catch { /* non-critical */ } finally {
      setLoadingCustomers(false);
      setLoadedOnce(true);
    }
  }, [tenant]);

  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch(`/api/crm/campaigns?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCampaigns(data.data);
    } catch { /* non-critical */ } finally {
      setLoadingCampaigns(false);
    }
  }, [tenant]);

  useEffect(() => { fetchSegments(selectedSegment); }, [selectedSegment, fetchSegments]);
  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) {
      showToast.error(dict?.crm?.nameBodyRequired || 'Name and body are required');
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
        setForm(EMPTY_FORM);
      } else {
        showToast.error(data.error || dict?.crm?.failedToSaveCampaign || 'Failed to save campaign');
      }
    } catch { showToast.error(dict?.crm?.failedToSaveCampaign || 'Failed to save campaign'); } finally { setSaving(false); }
  };

  // Sending emails or texts real customers and cannot be taken back, so it asks first.
  const handleSend = async (campaign: Campaign) => {
    const ok = await confirm(
      dict?.crm?.confirmSendTitle || 'Send this campaign?',
      (dict?.crm?.confirmSendMessage || '"{name}" goes out by {channel} to every active customer in {segment} who has contact details. This cannot be undone.')
        .replace('{name}', campaign.name)
        .replace('{channel}', channelLabel(dict, campaign.channel))
        .replace('{segment}', segmentText(dict, campaign.segment).label),
      { variant: 'danger', confirmText: dict?.crm?.send || 'Send', cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!ok) return;

    setSending(campaign._id);
    try {
      const res = await fetch(`/api/crm/campaigns/${campaign._id}/send?tenant=${tenant}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast.success((dict?.crm?.sentToCustomers || 'Sent to {count} customers').replace('{count}', String(data.data.sentCount)));
        setCampaigns((prev) => prev.map((c) => c._id === campaign._id ? { ...c, status: 'sent', sentCount: data.data.sentCount, sentAt: new Date().toISOString() } : c));
      } else {
        showToast.error(data.error || dict?.crm?.sendFailed || 'Send failed');
      }
    } catch { showToast.error(dict?.crm?.sendFailed || 'Send failed'); } finally { setSending(null); }
  };

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <PageTitle />
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const countOf = (seg: string) => (counts ? (counts[seg as keyof SegmentCounts] ?? 0) : 0);
  const listTitle = selectedSegment === 'all'
    ? (dict.crm?.allCustomers || 'All Customers')
    : `${segmentText(dict, selectedSegment).label} · ${dict.crm?.customers || 'Customers'}`;

  return (
    <RegisterPage
      tagNo="CR"
      tag={settings?.companyName}
      title={dict.crm?.title || 'CRM'}
      subtitle={dict.crm?.subtitle || 'Group customers by how they shop and send them campaigns.'}
      side={canManage ? (
        <button type="button" onClick={() => setShowCompose(true)} className={DARK_KEY_PRIMARY}>
          <Plus className={ICON} strokeWidth={1.75} aria-hidden />
          {dict.crm?.newCampaign || 'New Campaign'}
        </button>
      ) : undefined}
    >
      <PageTitle />
      {confirmDialog}

      {/* Segment keys, each with its count on the display */}
      <nav aria-label={dict.crm?.segment || 'Segment'} className="mt-6 grid grid-cols-2 border-l border-t border-white/20 sm:grid-cols-3 xl:grid-cols-6">
        {SEGMENT_ORDER.map((seg) => {
          const on = selectedSegment === seg;
          const text = segmentText(dict, seg);
          return (
            <button
              key={seg}
              type="button"
              aria-pressed={on}
              onClick={() => { setSelectedSegment(seg); setSelectedCustomer(null); }}
              className={`flex min-h-[44px] flex-col items-start border-b border-r border-white/20 px-4 py-3 text-left transition-colors touch-manipulation ${on ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
            >
              <span className={`font-led text-4xl leading-none ${on ? 'text-ink' : 'mk-led-glow text-[#7df0d6]'}`}>{countOf(seg)}</span>
              <span className="mt-2 font-receipt text-xs font-medium uppercase tracking-[0.08em]">{text.label}</span>
              <span className={`mt-0.5 text-xs leading-snug ${on ? 'text-ink/60' : 'text-white/55'}`}>{text.description}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Customers in the chosen segment */}
        <section className="xl:col-span-7" aria-busy={loadingCustomers}>
          <div className={`bg-paper-white text-ink transition-opacity ${loadingCustomers ? 'opacity-60' : ''}`}>
            <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-ink/30 px-4 py-4">
              <h2 className="text-3xl">{listTitle}</h2>
              <span className="shrink-0 font-receipt text-xs text-ink/60">{customers.length} {dict.crm?.shown || 'shown'}</span>
            </div>
            {customers.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{dict.crm?.noCustomersInSegment || 'No customers in this segment'}</p>
              </div>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/20">
                {customers.map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(c)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper touch-manipulation"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{c.firstName} {c.lastName}</span>
                        <span className="mt-0.5 block truncate font-receipt text-xs text-ink/60">{c.phone || c.email || (dict.crm?.noContact || 'No contact')}</span>
                      </span>
                      <span className="shrink-0 space-y-1 text-right">
                        <span className="block font-receipt text-sm"><Currency amount={c.totalSpent ?? 0} /></span>
                        <SegmentTag dict={dict} segment={c.computedSegment} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>

        {/* Campaigns, newest first */}
        <section className="xl:col-span-5" aria-busy={loadingCampaigns}>
          <div className="bg-paper-white text-ink">
            <h2 className="border-b border-dashed border-ink/30 px-4 py-4 text-3xl">{dict.crm?.recentCampaigns || 'Recent Campaigns'}</h2>
            {loadingCampaigns && campaigns.length === 0 ? (
              <div className="flex justify-center py-10"><LoadingSpinner size="md" /></div>
            ) : campaigns.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <Send className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                <p className="font-receipt text-sm text-ink/60">{dict.crm?.noCampaignsYet || 'No campaigns yet'}</p>
                {canManage && (
                  <button type="button" onClick={() => setShowCompose(true)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                    <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                    {dict.crm?.newCampaign || 'New Campaign'}
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/20">
                {campaigns.map((c) => {
                  const ChannelIcon = c.channel === 'email' ? Mail : MessageSquare;
                  return (
                    <li key={c._id} className="flex items-start gap-3 px-4 py-3">
                      <ChannelIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink/50" strokeWidth={1.75} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                          <StatusTag dict={dict} status={c.status} />
                          <span>{channelLabel(dict, c.channel)} · {segmentText(dict, c.segment).label}</span>
                          <span>{formatDate(c.sentAt || c.createdAt, dateSettings)}</span>
                          {c.sentCount != null && c.sentCount > 0 && (
                            <span>{(dict.crm?.sentCount || '{count} sent').replace('{count}', String(c.sentCount))}</span>
                          )}
                        </p>
                      </div>
                      {canManage && c.status !== 'sent' && (
                        <button type="button" onClick={() => handleSend(c)} disabled={sending === c._id} className={`${KEY} shrink-0`}>
                          <Send className={ICON} strokeWidth={1.75} aria-hidden />
                          {sending === c._id ? (dict.crm?.sending || 'Sending...') : (dict.crm?.send || 'Send')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </div>

      {/* Customer card */}
      {selectedCustomer && (
        <Sheet
          title={`${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
          subtitle={[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ') || (dict.crm?.noContact || 'No contact')}
          onClose={() => setSelectedCustomer(null)}
          closeLabel={dict.common?.close || 'Close'}
          footer={
            <Link href={`/${tenant}/${lang}/admin/customers`} className={KEY}>
              {dict.crm?.openCustomers || 'Open Customers'}
            </Link>
          }
        >
          <div className="mb-3"><SegmentTag dict={dict} segment={selectedCustomer.computedSegment} /></div>
          <div className="space-y-1.5 font-receipt text-sm">
            <ReceiptRow label={dict.crm?.orders || 'Orders'} value={selectedCustomer.orderCount} />
            <ReceiptRow label={dict.crm?.totalSpent || 'Total Spent'} value={<Currency amount={selectedCustomer.totalSpent ?? 0} />} />
            <ReceiptRow label={dict.loyalty?.points || 'Points'} value={(selectedCustomer.loyaltyPointsBalance ?? 0).toLocaleString()} />
            {selectedCustomer.lastPurchaseDate && (
              <ReceiptRow
                label={(dict.crm?.lastPurchase || 'Last purchase:').replace(/:\s*$/, '')}
                value={formatDate(selectedCustomer.lastPurchaseDate, dateSettings)}
              />
            )}
          </div>
          {selectedCustomer.tags && selectedCustomer.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1 border-t border-dashed border-ink/30 pt-4">
              {selectedCustomer.tags.map((t) => (
                <span key={t} className="border border-dashed border-ink/30 px-1.5 py-0.5 font-receipt text-[11px] text-ink/70">{t}</span>
              ))}
            </div>
          )}
        </Sheet>
      )}

      {/* Compose campaign */}
      {showCompose && canManage && (
        <Sheet
          title={dict.crm?.newCampaign || 'New Campaign'}
          onClose={() => setShowCompose(false)}
          closeLabel={dict.common?.close || 'Close'}
          footer={
            <>
              <button type="button" onClick={() => setShowCompose(false)} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
              <button type="submit" form="campaign-form" disabled={saving} className={KEY_PRIMARY}>
                {saving ? (dict.admin?.saving || 'Saving...') : (dict.crm?.saveDraft || 'Save Draft')}
              </button>
            </>
          }
        >
          <form id="campaign-form" onSubmit={handleCreateCampaign} className="space-y-4">
            <div>
              <label htmlFor="campaign-name" className={LABEL}>{dict.crm?.campaignName || 'Campaign Name'}</label>
              <input
                id="campaign-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT}
                placeholder={dict.crm?.campaignNamePlaceholder || 'e.g. VIP Exclusive Offer'}
              />
            </div>

            <fieldset>
              <legend className={LABEL}>{dict.crm?.channel || 'Channel'}</legend>
              <div className="grid grid-cols-2 border-l border-t border-ink/25">
                {(['email', 'sms'] as Channel[]).map((ch) => {
                  const Icon = ch === 'email' ? Mail : MessageSquare;
                  return (
                    <button
                      key={ch}
                      type="button"
                      aria-pressed={form.channel === ch}
                      onClick={() => setForm((f) => ({ ...f, channel: ch }))}
                      className={`flex min-h-[44px] items-center justify-center gap-2 border-b border-r border-ink/25 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${form.channel === ch ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                    >
                      <Icon className={ICON} strokeWidth={1.75} aria-hidden />
                      {channelLabel(dict, ch)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <label htmlFor="campaign-segment" className={LABEL}>{dict.crm?.targetSegment || 'Target Segment'}</label>
              <select
                id="campaign-segment"
                value={form.segment}
                onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as Segment }))}
                className={INPUT}
              >
                {SEGMENT_ORDER.map((seg) => (
                  <option key={seg} value={seg}>{segmentText(dict, seg).label} ({countOf(seg)})</option>
                ))}
              </select>
            </div>

            {form.channel === 'email' && (
              <div>
                <label htmlFor="campaign-subject" className={LABEL}>{dict.crm?.subject || 'Subject'}</label>
                <input
                  id="campaign-subject"
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className={INPUT}
                  placeholder={dict.crm?.subjectPlaceholder || "We miss you! Here's 10% off..."}
                />
              </div>
            )}

            <div>
              <label htmlFor="campaign-body" className={LABEL}>{dict.crm?.message || 'Message'}</label>
              <textarea
                id="campaign-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={6}
                className={`${INPUT} resize-none`}
                placeholder={dict.crm?.messagePlaceholder || 'Hi {firstName}, we have something special for you...'}
              />
              <p className={`${HINT} flex justify-between gap-3`}>
                <span>{dict.crm?.personalizationHint || 'Use {firstName} as a personalization token'}</span>
                {form.channel === 'sms' && (
                  <span className={`shrink-0 ${form.body.length > 160 ? 'text-stamp' : ''}`}>{form.body.length}/160</span>
                )}
              </p>
              {form.channel === 'sms' && <p className={HINT}>{dict.crm?.smsCharLimit || '(160 char limit for single SMS)'}</p>}
            </div>
          </form>
        </Sheet>
      )}
    </RegisterPage>
  );
}
