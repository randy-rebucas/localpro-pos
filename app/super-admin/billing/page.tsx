'use client';

import { useState, useCallback } from 'react';
import { ExternalLink, Plus, Receipt, Search } from 'lucide-react';
import { showToast } from '@/lib/toast';
import {
  DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, Empty, INPUT, KEY, KEY_PRIMARY, LABEL, LINK, LedReadout, Printing,
  SaPage, SaPager, SELECT, Sheet, Slip, TABLE, TBODY, TD, TD_RIGHT, TD_TEXT, TEXTAREA, TH, TH_RIGHT, THEAD, TR, Tag, type TagTone,
} from '@/components/super-admin/ui';

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

const TYPE_TONE: Record<string, TagTone> = {
  payment_received: 'ok',
  payment_failed: 'bad',
  refund_issued: 'warn',
  credit_applied: 'info',
  manual_adjustment: 'info',
  invoice_created: 'muted',
};

const FORM_ID = 'billing-event';

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

  const typeTag = (type: string) => <Tag tone={TYPE_TONE[type] || 'muted'}>{type.replace(/_/g, ' ')}</Tag>;
  const amount = (ev: BillingEvent) => `${ev.currency} ${ev.amount.toLocaleString()}`;
  const invoiceLink = (ev: BillingEvent) =>
    ev.invoiceUrl ? (
      <a href={ev.invoiceUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
        View
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </a>
    ) : (
      <span className="font-receipt text-xs text-ink/40">—</span>
    );

  return (
    <SaPage
      tagNo="08"
      tag="Till roll"
      title="Billing"
      subtitle="Look up a store by slug to read its billing history, or record a payment, refund or adjustment by hand."
      side={searchedSlug && !loading && !notFound ? <LedReadout value={pagination.total} label="Events" /> : undefined}
    >
      <form onSubmit={handleSearch} aria-label="Find a tenant" className="mt-8 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <label htmlFor="billing-slug" className={DARK_LABEL}>Tenant slug</label>
          <input
            id="billing-slug"
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            placeholder="my-store"
            className={`${DARK_FIELD} placeholder:text-ink/40`}
          />
        </div>
        <button type="submit" className={DARK_KEY_PRIMARY}>
          <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Search
        </button>
        {searchedSlug && (
          <button type="button" onClick={openRecordForm} className={`${DARK_KEY} sm:ml-auto`}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Record billing event
          </button>
        )}
      </form>

      <Slip
        title={searchedSlug ? <>Billing history · <span className="text-ink">{searchedSlug}</span></> : 'Billing history'}
        tear
        className="mt-6"
      >
        <div aria-busy={loading}>
          {!searchedSlug ? (
            <Empty icon={<Receipt className="h-8 w-8" strokeWidth={1.75} aria-hidden />}>Search a tenant by slug to view their billing history.</Empty>
          ) : loading ? (
            <Printing label="Loading…" />
          ) : notFound ? (
            <Empty>Tenant or subscription not found.</Empty>
          ) : events.length === 0 ? (
            <Empty>No billing events found for this tenant.</Empty>
          ) : (
            <>
              {/* Below lg: one printed line per event */}
              <ul className="divide-y divide-dashed divide-ink/20 lg:hidden">
                {events.map((ev) => (
                  <li key={ev._id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {typeTag(ev.type)}
                      <span className="font-receipt text-sm font-semibold">{amount(ev)}</span>
                    </div>
                    {ev.description && <p className="mt-1.5 text-sm">{ev.description}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 font-receipt text-xs text-ink/60">
                      <span>{fmt(ev.createdAt)}</span>
                      {ev.transactionId && <span>TX {ev.transactionId}</span>}
                      {ev.invoiceUrl && invoiceLink(ev)}
                    </div>
                  </li>
                ))}
              </ul>

              {/* From lg: the full roll */}
              <div className="hidden overflow-x-auto lg:block" role="region" aria-label="Billing events" tabIndex={0}>
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th scope="col" className={TH}>Date</th>
                      <th scope="col" className={TH}>Type</th>
                      <th scope="col" className={TH_RIGHT}>Amount</th>
                      <th scope="col" className={TH}>Description</th>
                      <th scope="col" className={TH}>Transaction ID</th>
                      <th scope="col" className={TH}>Invoice</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {events.map((ev) => (
                      <tr key={ev._id} className={TR}>
                        <td className={`${TD} whitespace-nowrap text-xs text-ink/70`}>{fmt(ev.createdAt)}</td>
                        <td className={TD}>{typeTag(ev.type)}</td>
                        <td className={`${TD_RIGHT} font-semibold`}>{amount(ev)}</td>
                        <td className={`${TD_TEXT} max-w-[240px] truncate text-ink/70`} title={ev.description}>{ev.description || '—'}</td>
                        <td className={`${TD} text-xs text-ink/60`}>{ev.transactionId || '—'}</td>
                        <td className={TD}>{invoiceLink(ev)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <SaPager
                page={pagination.page}
                totalPages={pagination.pages}
                onPageChange={(page) => fetchEvents(searchedSlug, page, pagination.limit)}
              />
            </>
          )}
        </div>
      </Slip>

      {showForm && (
        <Sheet
          title="Record billing event"
          subtitle={<>Tenant: <span className="font-receipt font-medium text-ink">{searchedSlug}</span></>}
          onClose={() => setShowForm(false)}
          closeLabel="Close"
          footer={
            <>
              <button type="button" onClick={() => setShowForm(false)} className={KEY}>Cancel</button>
              <button type="submit" form={FORM_ID} disabled={saving || !formAmount} className={KEY_PRIMARY}>
                {saving ? 'Saving…' : 'Record event'}
              </button>
            </>
          }
        >
          <form id={FORM_ID} onSubmit={submitEvent} className="space-y-4">
            <div>
              <label htmlFor={`${FORM_ID}-type`} className={LABEL}>Type *</label>
              <select
                id={`${FORM_ID}-type`}
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className={`${SELECT} w-full capitalize`}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${FORM_ID}-amount`} className={LABEL}>Amount (₱) *</label>
              <input
                id={`${FORM_ID}-amount`}
                type="number" min="0" step="0.01" required
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className={`${INPUT} font-receipt`}
                placeholder="0.00"
              />
            </div>
            <div>
              <label htmlFor={`${FORM_ID}-desc`} className={LABEL}>Description</label>
              <input id={`${FORM_ID}-desc`} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} className={INPUT} placeholder="Optional" />
            </div>
            <div>
              <label htmlFor={`${FORM_ID}-tx`} className={LABEL}>Transaction ID</label>
              <input id={`${FORM_ID}-tx`} value={formTxId} onChange={(e) => setFormTxId(e.target.value)} className={INPUT} placeholder="Optional" />
            </div>
            <div>
              <label htmlFor={`${FORM_ID}-invoice`} className={LABEL}>Invoice URL</label>
              <input id={`${FORM_ID}-invoice`} value={formInvoiceUrl} onChange={(e) => setFormInvoiceUrl(e.target.value)} className={INPUT} placeholder="Optional" />
            </div>
            <div>
              <label htmlFor={`${FORM_ID}-notes`} className={LABEL}>Notes</label>
              <textarea
                id={`${FORM_ID}-notes`}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className={`${TEXTAREA} resize-none`}
                placeholder="Optional"
              />
            </div>
          </form>
        </Sheet>
      )}
    </SaPage>
  );
}
