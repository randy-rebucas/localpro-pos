'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useInvoicesList, type Invoice } from '@/hooks/useInvoicesList';
import { useInvoiceForm, invoiceFormSubtotal } from '@/hooks/useInvoiceForm';
import {
  getInvoiceStatusColor,
  getInvoiceStatusLabel,
  getAllowedNextInvoiceStatuses,
  isInvoiceStatusEditable,
  type InvoiceStatus,
} from '@/lib/invoice-helpers';

interface CustomerOption {
  id: string;
  firstName: string;
  lastName: string;
}

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT_CLASS = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL_CLASS = 'block text-xs font-medium text-gray-600 mb-1';

function customerName(invoice: Invoice): string {
  return invoice.customer
    ? `${invoice.customer.firstName} ${invoice.customer.lastName}`
    : (invoice.snapshotName || '—');
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export default function InvoicesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [notesInput, setNotesInput] = useState('');
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const { canAccess } = usePermissions();
  const canCreate = canAccess('invoices.create');
  const canUpdateStatus = canAccess('invoices.update_status');

  const { invoices, loading, pagination, fetchInvoices, updateInvoiceStatus } = useInvoicesList();
  const { formData, setFormData, submitting, error, addItem, removeItem, updateItem, handleSubmit: submitForm, resetForm } = useInvoiceForm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const loadInvoices = (page = 1) => {
    setLoadError(null);
    return fetchInvoices({ status: filterStatus, customerId: '', overdue: filterOverdue }, page, (err) => setLoadError(err));
  };

  useEffect(() => {
    loadInvoices(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterOverdue]);

  useEffect(() => {
    (async () => {
      try {
        const res = await globalThis.fetch(`/api/customers?tenant=${tenant}&limit=200`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) setCustomers(data.data || []);
      } catch {
        // Non-fatal: create-invoice drawer falls back to no customer selected.
      }
    })();
  }, [tenant]);

  // Refetch the page the user is on, not page 1.
  const refetch = () => loadInvoices(pagination?.page ?? 1);

  const openCreate = () => {
    // Reset on open (not close) so the drawer keeps its content while sliding out.
    resetForm();
    setShowCreateModal(true);
  };

  const openDetail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setNotesInput(invoice.notes || '');
    setPaidAmountInput('');
    setShowDetailModal(true);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation/save errors render inline in the drawer via `error`.
    await submitForm(async (message) => {
      showToast.success(dict?.admin?.invoiceCreatedSuccess || message);
      setShowCreateModal(false);
      await refetch();
    });
  };

  const handleStatusChange = async (status: InvoiceStatus) => {
    if (!selectedInvoice || status === selectedInvoice.status) return;
    if (status === 'cancelled') {
      const template = dict?.admin?.confirmCancelInvoice || 'Cancel invoice "{number}"? This cannot be undone.';
      if (!confirm(template.replace('{number}', selectedInvoice.invoiceNumber))) return;
    }
    setUpdating(true);
    await updateInvoiceStatus(
      selectedInvoice.id,
      {
        status,
        notes: notesInput !== (selectedInvoice.notes || '') ? notesInput : undefined,
        paidAmount: status === 'paid' && paidAmountInput ? Number(paidAmountInput) : undefined,
      },
      (invoice) => {
        showToast.success(dict?.admin?.invoiceUpdatedSuccess || 'Invoice updated successfully');
        // PATCH returns scalar fields only (no `items`/`customer`/`transaction`
        // relations) — merge onto the existing detail so those stay populated.
        setSelectedInvoice((prev) => (prev ? { ...prev, ...invoice } : invoice));
        refetch();
      },
      (err) => showToast.error(err)
    );
    setUpdating(false);
  };

  const handleSaveNotes = async () => {
    if (!selectedInvoice) return;
    setUpdating(true);
    await updateInvoiceStatus(
      selectedInvoice.id,
      { notes: notesInput },
      (invoice) => {
        showToast.success(dict?.admin?.invoiceUpdatedSuccess || 'Invoice updated successfully');
        setSelectedInvoice((prev) => (prev ? { ...prev, ...invoice } : invoice));
        refetch();
      },
      (err) => showToast.error(err)
    );
    setUpdating(false);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const outstandingTotal = invoices
    .filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total), 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;
  const totalCount = pagination?.total ?? invoices.length;
  const hasFilters = filterStatus !== 'all' || filterOverdue;
  const formSubtotal = invoiceFormSubtotal(formData.items);
  const notesDirty = !!selectedInvoice && notesInput !== (selectedInvoice.notes || '');
  const closeLabel = dict.common?.close || 'Close';

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingInvoices || 'Loading invoices…'}</p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{loadError}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (invoices.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noInvoicesMatch || 'No invoices match your filters.')
            : (dict.admin?.noInvoicesYet || 'No invoices yet.')}
        </div>
      );
    }

    const viewLabel = dict.common?.view || 'View';

    return (
      <div className="border border-gray-300 bg-white">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.invoiceNumber || 'Invoice #'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.customer || 'Customer'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.dueDate || 'Due Date'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.total || 'Total'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoices.map((invoice) => {
                const email = invoice.customer?.email || invoice.snapshotEmail;
                return (
                  <tr key={invoice.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-900">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{customerName(invoice)}</p>
                      {email && <p className="text-xs text-gray-400">{email}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                      <Currency amount={Number(invoice.total)} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusColor(invoice.status)}`}>
                        {getInvoiceStatusLabel(invoice.status, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(invoice)}
                          title={viewLabel}
                          aria-label={`${viewLabel}: ${invoice.invoiceNumber}`}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination && pagination.pages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {dict.admin?.showing || 'Showing'} {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} {dict.admin?.of || 'of'} {pagination.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadInvoices(pagination.page - 1)}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.pages}
                onClick={() => loadInvoices(pagination.page + 1)}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.invoices || 'Invoices'}
          description={dict.admin?.invoicesSubtitle || 'Bill customers and track payment status'}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {dict.admin?.totalInvoices || 'Total Invoices'}
              </p>
              <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">
                {loading ? '—' : totalCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {dict.admin?.outstandingBalance || 'Outstanding Balance'}
              </p>
              <p className="text-3xl font-bold tabular-nums text-brand mt-1.5">
                {loading ? '—' : <Currency amount={outstandingTotal} />}
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {dict.admin?.overdueInvoices || 'Overdue'}
              </p>
              <p className={`text-3xl font-bold tabular-nums mt-1.5 ${overdueCount > 0 ? 'text-win8-danger' : 'text-gray-900'}`}>
                {loading ? '—' : overdueCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="invoices-status" className={LABEL_CLASS}>
                {dict.admin?.status || 'Status'}
              </label>
              <select
                id="invoices-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-44"
              >
                <option value="all">{dict.admin?.allStatuses || 'All Statuses'}</option>
                <option value="draft">{dict.admin?.invoiceStatusDraft || 'Draft'}</option>
                <option value="sent">{dict.admin?.invoiceStatusSent || 'Sent'}</option>
                <option value="paid">{dict.admin?.invoiceStatusPaid || 'Paid'}</option>
                <option value="overdue">{dict.admin?.invoiceStatusOverdue || 'Overdue'}</option>
                <option value="cancelled">{dict.admin?.invoiceStatusCancelled || 'Cancelled'}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-2">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={filterOverdue}
                onChange={(e) => setFilterOverdue(e.target.checked)}
              />
              {dict.admin?.overdueOnly || 'Overdue only'}
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('all');
                  setFilterOverdue(false);
                }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                {dict.common?.clearFilters || 'Clear Filters'}
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="ml-auto px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.newInvoice || 'New Invoice'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      {/* Detail / status drawer. selectedInvoice is kept on close so the header doesn't blank mid-slide. */}
      <Win8Drawer open={showDetailModal && !!selectedInvoice} onClose={() => setShowDetailModal(false)} widthClass="max-w-2xl">
        {selectedInvoice && (
          <>
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <h2 className="text-base font-semibold font-mono">{selectedInvoice.invoiceNumber}</h2>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                title={closeLabel}
                aria-label={closeLabel}
                className="text-white/70 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={LABEL_CLASS}>{dict.admin?.customer || 'Customer'}</p>
                  <p className="text-sm font-medium text-gray-900">{customerName(selectedInvoice)}</p>
                  {(selectedInvoice.customer?.email || selectedInvoice.snapshotEmail) && (
                    <p className="text-xs text-gray-400">{selectedInvoice.customer?.email || selectedInvoice.snapshotEmail}</p>
                  )}
                </div>
                <div>
                  <p className={LABEL_CLASS}>{dict.admin?.status || 'Status'}</p>
                  <span className={`px-2 py-0.5 text-xs font-semibold ${getInvoiceStatusColor(selectedInvoice.status)}`}>
                    {getInvoiceStatusLabel(selectedInvoice.status, dict)}
                  </span>
                </div>
                <div>
                  <p className={LABEL_CLASS}>{dict.admin?.dueDate || 'Due Date'}</p>
                  <p className="text-sm text-gray-900 tabular-nums">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className={LABEL_CLASS}>{dict.admin?.paymentTerms || 'Payment Terms'}</p>
                  <p className="text-sm text-gray-900">{selectedInvoice.paymentTerms || '—'}</p>
                </div>
              </div>

              <hr className="border-gray-300" />

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dict.admin?.lineItems || 'Line Items'}</p>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 text-left text-xs font-medium text-gray-500">{dict.admin?.item || 'Item'}</th>
                      <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict.admin?.qty || 'Qty'}</th>
                      <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict.admin?.price || 'Price'}</th>
                      <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict.admin?.subtotal || 'Subtotal'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedInvoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 pr-3">
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-700">{item.quantity}</td>
                        <td className="py-2 text-right tabular-nums text-gray-700"><Currency amount={Number(item.price)} /></td>
                        <td className="py-2 text-right tabular-nums font-medium text-gray-900"><Currency amount={Number(item.subtotal)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-200 pt-3 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between text-gray-500">
                  <span>{dict.admin?.subtotal || 'Subtotal'}</span>
                  <Currency amount={Number(selectedInvoice.subtotal)} />
                </div>
                {Number(selectedInvoice.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>{dict.admin?.discount || 'Discount'}</span>
                    <span>-<Currency amount={Number(selectedInvoice.discountAmount)} /></span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>{dict.admin?.tax || 'Tax'}</span>
                  <Currency amount={Number(selectedInvoice.taxAmount)} />
                </div>
                <div className="flex justify-between text-gray-900 font-bold text-base pt-1">
                  <span>{dict.admin?.total || 'Total'}</span>
                  <Currency amount={Number(selectedInvoice.total)} />
                </div>
              </div>

              <hr className="border-gray-300" />

              <div>
                <label htmlFor="invoice-status" className={LABEL_CLASS}>{dict.admin?.changeStatus || 'Change Status'}</label>
                <select
                  id="invoice-status"
                  value={selectedInvoice.status}
                  disabled={updating || !canUpdateStatus || !isInvoiceStatusEditable(selectedInvoice.status)}
                  onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
                  className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {getAllowedNextInvoiceStatuses(selectedInvoice.status).map((s) => (
                    <option key={s} value={s}>{getInvoiceStatusLabel(s, dict)}</option>
                  ))}
                </select>
              </div>

              {(selectedInvoice.status === 'sent' || selectedInvoice.status === 'overdue') && canUpdateStatus && (
                <div>
                  <label htmlFor="invoice-paid-amount" className={LABEL_CLASS}>{dict.admin?.paidAmount || 'Paid Amount'}</label>
                  <input
                    id="invoice-paid-amount"
                    type="number"
                    step="0.01"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder={String(selectedInvoice.total)}
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                  <p className="text-xs text-gray-400 mt-1">{dict.admin?.paidAmountHint || 'Optional — defaults to the invoice total when marked paid'}</p>
                </div>
              )}

              <div>
                <label htmlFor="invoice-notes" className={LABEL_CLASS}>{dict.admin?.notes || 'Notes'}</label>
                <textarea
                  id="invoice-notes"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={3}
                  disabled={!canUpdateStatus}
                  className={`${INPUT_CLASS} resize-none disabled:bg-gray-100`}
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
              >
                {closeLabel}
              </button>
              {canUpdateStatus && (
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={!notesDirty || updating}
                  className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
                >
                  {updating ? (dict.common?.saving || 'Saving…') : (dict.admin?.saveNotes || 'Save Notes')}
                </button>
              )}
            </div>
          </>
        )}
      </Win8Drawer>

      {/* Create invoice drawer */}
      <Win8Drawer open={showCreateModal} onClose={() => setShowCreateModal(false)} widthClass="max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{dict.admin?.newInvoice || 'New Invoice'}</h2>
          <button
            type="button"
            onClick={() => setShowCreateModal(false)}
            title={closeLabel}
            aria-label={closeLabel}
            className="text-white/70 hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleCreateInvoice} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="invoice-customer" className={LABEL_CLASS}>{dict.admin?.customer || 'Customer'}</label>
                <select
                  id="invoice-customer"
                  value={formData.customerId}
                  onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="">{dict.admin?.none || 'None'}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="invoice-due-date" className={LABEL_CLASS}>
                  {dict.admin?.dueDate || 'Due Date'} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="invoice-due-date"
                  type="date"
                  required
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <label htmlFor="invoice-terms" className={LABEL_CLASS}>{dict.admin?.paymentTerms || 'Payment Terms'}</label>
              <input
                id="invoice-terms"
                type="text"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                placeholder={dict.admin?.paymentTermsPlaceholder || 'Due on receipt'}
                className={INPUT_CLASS}
              />
            </div>

            <hr className="border-gray-300" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {dict.admin?.lineItems || 'Line Items'} <span className="text-win8-danger">*</span>
                </p>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1 text-xs border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors"
                >
                  + {dict.admin?.addItem || 'Add Item'}
                </button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => {
                  const removeLabel = dict.admin?.removeLineItem || 'Remove line item';
                  return (
                    <div key={index} className="flex gap-2 items-start border border-gray-300 p-3">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(index, { name: e.target.value })}
                          placeholder={dict.admin?.itemNamePlaceholder || 'Item name'}
                          aria-label={dict.admin?.itemNamePlaceholder || 'Item name'}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder={dict.admin?.descriptionOptional || 'Description (optional)'}
                          aria-label={dict.admin?.descriptionOptional || 'Description (optional)'}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        placeholder={dict.admin?.qty || 'Qty'}
                        aria-label={dict.admin?.quantity || 'Quantity'}
                        className="w-16 border border-gray-300 px-2 py-2 text-sm bg-white tabular-nums"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => updateItem(index, { price: e.target.value })}
                        placeholder={dict.admin?.price || 'Price'}
                        aria-label={dict.admin?.price || 'Price'}
                        className="w-24 border border-gray-300 px-2 py-2 text-sm bg-white tabular-nums"
                      />
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          title={removeLabel}
                          aria-label={removeLabel}
                          className={`${ICON_BUTTON} bg-win8-danger`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-2 text-sm font-semibold text-gray-900 tabular-nums">
                {dict.admin?.subtotal || 'Subtotal'}: <Currency amount={formSubtotal} className="ml-1" />
              </div>
            </div>

            <div>
              <label htmlFor="invoice-create-notes" className={LABEL_CLASS}>
                {dict.admin?.notes || 'Notes'} <span className="text-gray-400 font-normal">({dict.common?.optional || 'optional'})</span>
              </label>
              <textarea
                id="invoice-create-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className={`${INPUT_CLASS} resize-none`}
              />
            </div>

            {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.createInvoice || 'Create Invoice')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
