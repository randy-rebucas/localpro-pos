'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
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

  const { canAccess } = usePermissions();
  const canManage = canAccess('invoices.manage');
  const canUpdateStatus = canAccess('invoices.update_status');

  const { invoices, loading, pagination, fetchInvoices, updateInvoiceStatus } = useInvoicesList();
  const { formData, setFormData, submitting, error, addItem, removeItem, updateItem, handleSubmit: submitForm, resetForm } = useInvoiceForm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchInvoices({ status: filterStatus, customerId: '', overdue: filterOverdue }, 1, (err) => toast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterOverdue]);

  useEffect(() => {
    (async () => {
      try {
        const res = await globalThis.fetch(`/api/customers?tenant=${tenant}&limit=200`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) setCustomers(data.data || []);
      } catch {
        // Non-fatal: create-invoice modal falls back to no customer selected.
      }
    })();
  }, [tenant]);

  const refetch = () => fetchInvoices({ status: filterStatus, customerId: '', overdue: filterOverdue }, 1, (err) => toast.error(err));

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async (message) => {
        toast.success(message);
        await refetch();
        setShowCreateModal(false);
        resetForm();
      },
      (err) => toast.error(err)
    );
  };

  const handleStatusChange = (status: InvoiceStatus) => {
    if (!selectedInvoice) return;
    updateInvoiceStatus(
      selectedInvoice.id,
      {
        status,
        notes: notesInput !== (selectedInvoice.notes || '') ? notesInput : undefined,
        paidAmount: status === 'paid' && paidAmountInput ? Number(paidAmountInput) : undefined,
      },
      (invoice) => {
        toast.success(dict?.admin?.invoiceUpdatedSuccess || 'Invoice updated successfully');
        // PATCH returns scalar fields only (no `items`/`customer`/`transaction`
        // relations) — merge onto the existing detail so those stay populated.
        setSelectedInvoice((prev) => (prev ? { ...prev, ...invoice } : invoice));
        refetch();
      },
      (err) => toast.error(err)
    );
  };

  const handleSaveNotes = () => {
    if (!selectedInvoice) return;
    updateInvoiceStatus(
      selectedInvoice.id,
      { notes: notesInput },
      (invoice) => {
        toast.success(dict?.admin?.invoiceUpdatedSuccess || 'Invoice updated successfully');
        setSelectedInvoice((prev) => (prev ? { ...prev, ...invoice } : invoice));
        refetch();
      },
      (err) => toast.error(err)
    );
  };

  const outstandingTotal = invoices
    .filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((sum, i) => sum + Number(i.total), 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  const formSubtotal = invoiceFormSubtotal(formData.items);

  if (!dict || (loading && invoices.length === 0)) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingInvoices || 'Loading invoices...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
              {dict?.admin?.invoices || 'Invoices'}
            </h1>
            <p className="text-sm text-gray-500">{dict?.admin?.invoicesSubtitle || 'Bill customers and track payment status'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-2 border border-brand-hover"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {dict?.admin?.newInvoice || 'New Invoice'}
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-sm text-gray-500">{dict?.admin?.totalInvoices || 'Total Invoices'}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{pagination?.total ?? invoices.length}</p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-sm text-gray-500">{dict?.admin?.outstandingBalance || 'Outstanding Balance'}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1"><Currency amount={outstandingTotal} /></p>
          </div>
          <div className="bg-white border border-gray-300 p-5">
            <p className="text-sm text-gray-500">{dict?.admin?.overdueInvoices || 'Overdue'}</p>
            <p className={`text-2xl font-bold mt-1 ${overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdueCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
          >
            <option value="all">{dict?.admin?.allStatuses || 'All Statuses'}</option>
            <option value="draft">{dict?.admin?.invoiceStatusDraft || 'Draft'}</option>
            <option value="sent">{dict?.admin?.invoiceStatusSent || 'Sent'}</option>
            <option value="paid">{dict?.admin?.invoiceStatusPaid || 'Paid'}</option>
            <option value="overdue">{dict?.admin?.invoiceStatusOverdue || 'Overdue'}</option>
            <option value="cancelled">{dict?.admin?.invoiceStatusCancelled || 'Cancelled'}</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filterOverdue}
              onChange={(e) => setFilterOverdue(e.target.checked)}
              className="h-4 w-4"
            />
            {dict?.admin?.overdueOnly || 'Overdue only'}
          </label>
        </div>

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{dict?.admin?.allInvoices || 'All Invoices'}</h2>
            <span className="text-xs text-gray-400">{pagination?.total ?? invoices.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.invoiceNumber || 'Invoice #'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.customer || 'Customer'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.dueDate || 'Due Date'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.total || 'Total'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{invoice.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {invoice.customer ? `${invoice.customer.firstName} ${invoice.customer.lastName}` : (invoice.snapshotName || '—')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900"><Currency amount={Number(invoice.total)} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getInvoiceStatusColor(invoice.status)}`}>
                        {getInvoiceStatusLabel(invoice.status, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setNotesInput(invoice.notes || '');
                          setPaidAmountInput('');
                          setShowDetailModal(true);
                        }}
                        className="text-brand hover:text-brand-navy-deep"
                      >
                        {dict?.common?.view || 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noInvoicesFound || 'No invoices found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Status Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{selectedInvoice.invoiceNumber}</h3>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedInvoice(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.customer || 'Customer'}</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {selectedInvoice.customer
                      ? `${selectedInvoice.customer.firstName} ${selectedInvoice.customer.lastName}`
                      : (selectedInvoice.snapshotName || '—')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.dueDate || 'Due Date'}</label>
                  <p className="mt-1 text-sm text-gray-900">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{dict?.admin?.lineItems || 'Line Items'}</label>
                <div className="border border-gray-200 divide-y divide-gray-100">
                  {selectedInvoice.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start px-3 py-2 text-sm">
                      <div>
                        <p className="text-gray-900 font-medium">{item.name}</p>
                        {item.description && <p className="text-gray-500 text-xs">{item.description}</p>}
                        <p className="text-gray-400 text-xs">{item.quantity} × <Currency amount={Number(item.price)} /></p>
                      </div>
                      <p className="text-gray-900 font-medium"><Currency amount={Number(item.subtotal)} /></p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>{dict?.admin?.subtotal || 'Subtotal'}</span>
                  <Currency amount={Number(selectedInvoice.subtotal)} />
                </div>
                {Number(selectedInvoice.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>{dict?.admin?.discount || 'Discount'}</span>
                    <span>-<Currency amount={Number(selectedInvoice.discountAmount)} /></span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>{dict?.admin?.tax || 'Tax'}</span>
                  <Currency amount={Number(selectedInvoice.taxAmount)} />
                </div>
                <div className="flex justify-between text-gray-900 font-semibold text-base pt-1">
                  <span>{dict?.admin?.total || 'Total'}</span>
                  <Currency amount={Number(selectedInvoice.total)} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedInvoice.status}
                  disabled={!canUpdateStatus || !isInvoiceStatusEditable(selectedInvoice.status)}
                  onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAllowedNextInvoiceStatuses(selectedInvoice.status).map((s) => (
                    <option key={s} value={s}>{getInvoiceStatusLabel(s, dict)}</option>
                  ))}
                </select>
              </div>

              {selectedInvoice.status === 'sent' && canUpdateStatus && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.paidAmount || 'Paid Amount (optional, defaults to total)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder={String(selectedInvoice.total)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={3}
                  disabled={!canUpdateStatus}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50"
                />
                {canUpdateStatus && notesInput !== (selectedInvoice.notes || '') && (
                  <button
                    onClick={handleSaveNotes}
                    className="mt-2 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
                  >
                    {dict?.admin?.saveNotes || 'Save Notes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.newInvoice || 'New Invoice'}</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateInvoice} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.customer || 'Customer'}</label>
                  <select
                    value={formData.customerId}
                    onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  >
                    <option value="">{dict?.admin?.none || 'None'}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.dueDate || 'Due Date'} *</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.paymentTerms || 'Payment Terms'}</label>
                <input
                  type="text"
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  placeholder="Due on receipt"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.lineItems || 'Line Items'} *</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-sm text-brand hover:text-brand-navy-deep"
                  >
                    + {dict?.admin?.addItem || 'Add Item'}
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start border border-gray-200 p-2">
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(index, { name: e.target.value })}
                          placeholder={dict?.admin?.itemNamePlaceholder || 'Item name'}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                        />
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          placeholder={dict?.admin?.descriptionOptional || 'Description (optional)'}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                        />
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        placeholder="Qty"
                        className="w-16 px-2 py-1.5 text-sm border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.price}
                        onChange={(e) => updateItem(index, { price: e.target.value })}
                        placeholder={dict?.admin?.price || 'Price'}
                        className="w-24 px-2 py-1.5 text-sm border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                      />
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-red-500 hover:text-red-700 px-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2 text-sm font-semibold text-gray-900">
                  {dict?.admin?.subtotal || 'Subtotal'}: <Currency amount={formSubtotal} className="ml-1" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>

              {error && (
                <div className="bg-red-50 text-red-800 border border-red-300 p-3 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors bg-white"
                >
                  {dict?.common?.cancel || 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (dict?.common?.loading || 'Saving...') : (dict?.admin?.createInvoice || 'Create Invoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
