'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { showToast } from '@/lib/toast';

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

const SEGMENT_META: Record<string, { label: string; color: string; bg: string; border: string; description: string }> = {
  vip:      { label: 'VIP',      color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300', description: 'High spend or 500+ points' },
  new:      { label: 'New',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300',  description: 'Joined recently, ≤2 orders' },
  regular:  { label: 'Regular',  color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300', description: '3+ orders, steady buyer' },
  at_risk:  { label: 'At Risk',  color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300',description: 'No purchase in 30–90 days' },
  lapsed:   { label: 'Lapsed',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',   description: 'Inactive 90+ days' },
  prospect: { label: 'Prospect', color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-300',  description: 'No purchases yet' },
};

export default function CRMPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';

  const [counts, setCounts] = useState<SegmentCounts | null>(null);
  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<CRMCustomer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  // Campaign compose form
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState({ name: '', channel: 'email' as Channel, segment: 'all' as Segment, subject: '', body: '' });
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

  const handleCreateCampaign = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      showToast.error('Name and body are required');
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
        showToast.success('Campaign saved as draft');
        setCampaigns((prev) => [data.data, ...prev]);
        setShowCompose(false);
        setForm({ name: '', channel: 'email', segment: 'all', subject: '', body: '' });
      } else {
        showToast.error(data.error || 'Failed to save campaign');
      }
    } catch { showToast.error('Failed to save campaign'); } finally { setSaving(false); }
  };

  const handleSend = async (campaign: Campaign) => {
    setSending(campaign._id);
    try {
      const res = await fetch(`/api/crm/campaigns/${campaign._id}/send?tenant=${tenant}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(`Sent to ${data.data.sentCount} customers`);
        setCampaigns((prev) => prev.map((c) => c._id === campaign._id ? { ...c, status: 'sent', sentCount: data.data.sentCount, sentAt: new Date().toISOString() } : c));
      } else {
        showToast.error(data.error || 'Send failed');
      }
    } catch { showToast.error('Send failed'); } finally { setSending(null); }
  };

  const segmentOrder: Segment[] = ['all', 'vip', 'new', 'regular', 'at_risk', 'lapsed'];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PageTitle />
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">CRM</h1>
          <button
            type="button"
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-medium border transition-colors"
            style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            New Campaign
          </button>
        </div>

        {/* Segment cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {segmentOrder.map((seg) => {
            const meta = seg === 'all'
              ? { label: 'All Customers', color: 'text-gray-700', bg: 'bg-white', border: 'border-gray-300', description: 'Every active customer' }
              : SEGMENT_META[seg];
            const count = counts ? (seg === 'all' ? counts.all : counts[seg as keyof SegmentCounts] ?? 0) : null;
            return (
              <button
                key={seg}
                type="button"
                onClick={() => setSelectedSegment(seg)}
                className={`text-left p-4 border-2 transition-all ${meta.bg} ${
                  selectedSegment === seg ? `${meta.border} shadow-sm` : 'border-transparent hover:border-gray-300'
                }`}
                style={selectedSegment === seg ? { borderColor: primaryColor } : {}}
              >
                <p className={`text-2xl font-bold ${meta.color}`}>{count ?? '—'}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{meta.label}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{meta.description}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer list */}
          <div className="lg:col-span-2 bg-white border border-gray-300">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {segmentOrder.includes(selectedSegment) && selectedSegment !== 'all'
                  ? `${SEGMENT_META[selectedSegment]?.label} Customers`
                  : 'All Customers'}
              </h2>
              <span className="text-xs text-gray-400">{customers.length} shown</span>
            </div>
            {loadingCustomers ? (
              <div className="divide-y divide-gray-100">
                {[1,2,3,4].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-gray-200 w-1/3 rounded" />
                      <div className="h-2.5 bg-gray-200 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : customers.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-400 text-sm">No customers in this segment</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
                {customers.map((c) => {
                  const segMeta = SEGMENT_META[c.computedSegment];
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setSelectedCustomer(selectedCustomer?._id === c._id ? null : c)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedCustomer?._id === c._id ? 'bg-gray-50' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                        style={{ backgroundColor: primaryColor }}>
                        {c.firstName[0]}{c.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-gray-500 truncate">{c.email || c.phone || 'No contact'}</p>
                      </div>
                      <div className="flex-shrink-0 text-right space-y-1">
                        <p className="text-xs font-semibold text-gray-700"><Currency amount={c.totalSpent ?? 0} /></p>
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 border ${segMeta?.color ?? 'text-gray-600'} ${segMeta?.bg ?? 'bg-gray-50'} ${segMeta?.border ?? 'border-gray-300'}`}>
                          {segMeta?.label ?? c.computedSegment}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right sidebar — customer mini-profile OR campaign list */}
          <div className="space-y-4">
            {selectedCustomer ? (
              <div className="bg-white border border-gray-300">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Customer Profile</h2>
                  <button onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                      style={{ backgroundColor: primaryColor }}>
                      {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                      <p className="text-xs text-gray-500">{selectedCustomer.email || selectedCustomer.phone || 'No contact'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Orders', value: String(selectedCustomer.orderCount) },
                      { label: 'Total Spent', value: <Currency amount={selectedCustomer.totalSpent ?? 0} /> },
                      { label: 'Points', value: String(selectedCustomer.loyaltyPointsBalance ?? 0) },
                      { label: 'Segment', value: SEGMENT_META[selectedCustomer.computedSegment]?.label ?? selectedCustomer.computedSegment },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 border border-gray-200 p-2.5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
                      </div>
                    ))}
                  </div>
                  {selectedCustomer.lastPurchaseDate && (
                    <p className="text-xs text-gray-500">
                      Last purchase: {new Date(selectedCustomer.lastPurchaseDate).toLocaleDateString()}
                    </p>
                  )}
                  {selectedCustomer.tags && selectedCustomer.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedCustomer.tags.map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 border border-gray-300 text-gray-600">{t}</span>
                      ))}
                    </div>
                  )}
                  <a
                    href={`/${tenant}/${lang}/admin/customers`}
                    className="block w-full text-center text-xs py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors mt-1"
                  >
                    View full profile →
                  </a>
                </div>
              </div>
            ) : null}

            {/* Campaigns list */}
            <div className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Campaigns</h2>
              </div>
              {loadingCampaigns ? (
                <div className="px-4 py-6 text-center">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No campaigns yet</div>
              ) : (
                <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {campaigns.map((c) => (
                    <li key={c._id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500">
                            {c.channel.toUpperCase()} · {SEGMENT_META[c.segment]?.label ?? c.segment}
                            {c.sentCount != null && c.sentCount > 0 && ` · ${c.sentCount} sent`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${
                            c.status === 'sent' ? 'bg-green-50 text-green-700 border-green-300' :
                            c.status === 'failed' ? 'bg-red-50 text-red-700 border-red-300' :
                            'bg-gray-50 text-gray-600 border-gray-300'
                          }`}>
                            {c.status.toUpperCase()}
                          </span>
                          {c.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleSend(c)}
                              disabled={sending === c._id}
                              className="text-xs px-2 py-1 text-white border transition-colors disabled:opacity-50"
                              style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                            >
                              {sending === c._id ? '…' : 'Send'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Compose campaign modal */}
      {showCompose && (
        <div
          className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
          onClick={() => setShowCompose(false)}
        >
          <div
            className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">New Campaign</h2>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 text-sm focus:outline-none focus:border-gray-500"
                  placeholder="e.g. VIP Exclusive Offer"
                />
              </div>
              {/* Channel */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Channel</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['email', 'sms'] as Channel[]).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, channel: ch }))}
                      className={`py-2.5 border-2 text-sm font-medium transition-colors ${form.channel === ch ? 'text-white' : 'bg-white text-gray-600 border-gray-300'}`}
                      style={form.channel === ch ? { backgroundColor: primaryColor, borderColor: primaryColor } : {}}
                    >
                      {ch === 'email' ? 'Email' : 'SMS'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Segment */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Target Segment</label>
                <select
                  value={form.segment}
                  onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value as Segment }))}
                  className="w-full px-3 py-2.5 border border-gray-300 text-sm focus:outline-none focus:border-gray-500"
                >
                  <option value="all">All Customers ({counts?.all ?? 0})</option>
                  <option value="vip">VIP ({counts?.vip ?? 0})</option>
                  <option value="new">New ({counts?.new ?? 0})</option>
                  <option value="regular">Regular ({counts?.regular ?? 0})</option>
                  <option value="at_risk">At Risk ({counts?.at_risk ?? 0})</option>
                  <option value="lapsed">Lapsed ({counts?.lapsed ?? 0})</option>
                </select>
              </div>
              {/* Subject (email only) */}
              {form.channel === 'email' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Subject</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 text-sm focus:outline-none focus:border-gray-500"
                    placeholder="We miss you! Here's 10% off..."
                  />
                </div>
              )}
              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Message {form.channel === 'sms' && <span className="text-gray-400 normal-case font-normal">(160 char limit for single SMS)</span>}
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  rows={6}
                  className="w-full px-3 py-2.5 border border-gray-300 text-sm focus:outline-none focus:border-gray-500 resize-none"
                  placeholder="Hi {firstName}, we have something special for you..."
                />
                <p className="text-[11px] text-gray-400 mt-1">Use {'{firstName}'} as a personalization token</p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="flex-1 py-2.5 border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCampaign}
                disabled={saving}
                className="flex-1 py-2.5 text-white text-sm font-medium border transition-colors disabled:opacity-50"
                style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
