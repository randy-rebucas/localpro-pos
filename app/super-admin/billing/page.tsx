'use client';

import { useState, useCallback } from 'react';
import { SuperAdminShell } from '@/components/super-admin/Shell';
import { showToast } from '@/lib/toast';

interface BillingEvent {
  _id: string;
  type: string;
  amount: number;
  currency: string;
  description?: string;
  notes?: string;
  transactionId?: string;
  invoiceUrl?: string;
  createdAt: string;
}

interface Pagination { page: number; limit: number; total: number; pages: number; }

const EVENT_TYPES = [
  'payment_received', 'payment_failed', 'refund_issued',
  'credit_applied', 'manual_adjustment', 'invoice_created',
];

const TYPE_BADGE: Record<string, string> = {
  payment_received: 'bg-green-100 text-green-800 border-green-200',
  payment_failed: 'bg-red-100 text-red-800 border-red-200',
  refund_issued: 'bg-orange-100 text-orange-800 border-orange-200',
  credit_applied: 'bg-blue-100 text-blue-800 border-blue-200',
  manual_adjustment: 'bg-purple-100 text-purple-800 border-purple-200',
  invoice_created: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function BillingPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [searchedSlug, setSearchedSlug] = useState('');
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('payment_received');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTxId, setFormTxId] = useState('');
  const [formInvoiceUrl, setFormInvoiceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchEvents = useCallback(async (slug: string, page: number, limit: number) => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/super-admin/billing/${slug}?page=${page}&limit=${limit}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
        setPagination(data.pagination);
      } else {
        setEvents([]);
        setNotFound(true);
        showToast.error(data.error || 'Failed to load billing history');
      }
    } catch {
      setEvents([]);
      setNotFound(true);
      showToast.error('Failed to load billing history');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = tenantSlug.trim().toLowerCase();
    if (!slug) return;
    setSearchedSlug(slug);
    fetchEvents(slug, 1, pagination.limit);
  };

  const openRecordForm = () => {
    setFormType('payment_received');
    setFormAmount('');
    setFormDescription('');
    setFormNotes('');
    setFormTxId('');
    setFormInvoiceUrl('');
    setShowForm(true);
  };

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchedSlug) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/billing/${searchedSlug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: formType,
          amount: Number(formAmount),
          description: formDescription || undefined,
          notes: formNotes || undefined,
          transactionId: formTxId || undefined,
          invoiceUrl: formInvoiceUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success('Billing event recorded');
        setShowForm(false);
        fetchEvents(searchedSlug, 1, pagination.limit);
      } else {
        showToast.error(data.error || 'Failed to record billing event');
      }
    } catch {
      showToast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <SuperAdminShell title="Billing">
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="bg-white border border-gray-100 p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tenant Slug</label>
            <input
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="my-store"
              className="px-3 py-2 border border-gray-200 text-sm w-56 focus:ring-2 focus:ring-brand-teal/30"
            />
          </div>
          <button type="submit" className="px-4 py-2 bg-brand-teal text-white text-sm font-medium hover:bg-brand-teal/90">
            Search
          </button>
          {searchedSlug && (
            <button
              type="button"
              onClick={openRecordForm}
              className="ml-auto px-4 py-2 border text-sm text-gray-600 hover:bg-gray-50"
            >
              + Record Billing Event
            </button>
          )}
        </form>

        {!searchedSlug ? (
          <div className="text-center py-12 text-gray-400">Search a tenant by slug to view their billing history.</div>
        ) : loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : notFound ? (
          <div className="text-center py-12 text-gray-400">Tenant or subscription not found.</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No billing events found for this tenant.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  {['Date', 'Type', 'Amount', 'Description', 'Transaction ID', 'Invoice'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map((ev) => (
                  <tr key={ev._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(ev.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium border capitalize ${TYPE_BADGE[ev.type] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {ev.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {ev.currency} {ev.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-[240px] truncate" title={ev.description}>
                      {ev.description || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{ev.transactionId || '—'}</td>
                    <td className="px-4 py-3">
                      {ev.invoiceUrl ? (
                        <a href={ev.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-teal hover:underline text-xs">
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagination.pages > 1 && (
              <div className="border-t px-4 py-3 flex items-center justify-between text-sm text-gray-500">
                <span>Page {pagination.page} of {pagination.pages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => fetchEvents(searchedSlug, pagination.page - 1, pagination.limit)}
                    className="px-3 py-1 border disabled:opacity-40 hover:bg-gray-50"
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => fetchEvents(searchedSlug, pagination.page + 1, pagination.limit)}
                    className="px-3 py-1 border disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Record Billing Event</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={submitEvent}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full border px-3 py-2 text-sm bg-white capitalize"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₱) *</label>
                  <input
                    type="number" min="0" step="0.01" required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full border px-3 py-2 text-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                  <input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full border px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Transaction ID</label>
                  <input
                    value={formTxId}
                    onChange={(e) => setFormTxId(e.target.value)}
                    className="w-full border px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Invoice URL</label>
                  <input
                    value={formInvoiceUrl}
                    onChange={(e) => setFormInvoiceUrl(e.target.value)}
                    className="w-full border px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    className="w-full border px-3 py-2 text-sm resize-none"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formAmount}
                  className="px-4 py-2 bg-brand-teal text-white text-sm font-medium hover:bg-brand-teal/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Record Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SuperAdminShell>
  );
}
