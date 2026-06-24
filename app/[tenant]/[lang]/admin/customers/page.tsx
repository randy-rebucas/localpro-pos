'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { useCustomersList, type Customer } from '@/hooks/useCustomersList';
import { useCustomersForm } from '@/hooks/useCustomersForm';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getToggleStatusMessage,
  getToggleStatusErrorMessage,
  formatCurrency,
} from '@/lib/customers-helpers';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export default function CustomersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any>>(null!); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [balancePayOpen, setBalancePayOpen] = useState(false);
  const [balancePayCustomer, setBalancePayCustomer] = useState<Customer | null>(null);
  const [bpAmount, setBpAmount] = useState('');
  const [bpMethod, setBpMethod] = useState<'cash' | 'card' | 'digital' | 'check' | 'other'>('cash');
  const [bpNotes, setBpNotes] = useState('');
  const [bpSubmitting, setBpSubmitting] = useState(false);
  const [balancePaymentHistory, setBalancePaymentHistory] = useState<Array<{
    _id: string;
    amount: number;
    method: string;
    notes?: string;
    createdAt: string;
  }>>([]);
  const [balanceHistoryLoading, setBalanceHistoryLoading] = useState(false);

  const { settings } = useTenantSettings();
  const enableOnAccountSales = settings?.enableOnAccountSales === true;

  const {
    customers,
    loading,
    page,
    totalPages,
    search,
    filterActive,
    setPage,
    setSearch,
    setFilterActive,
    fetchCustomers,
    initialLoadComplete,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    toggleCustomerStatus,
  } = useCustomersList();

  const { formData, setFormData, error, submitting, handleSubmit, resetForm, initializeForm } = useCustomersForm();
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    if (dict) fetchCustomers();
  }, [dict, fetchCustomers]);

  const openCreate = () => {
    setEditingCustomer(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    initializeForm(customer);
    setShowModal(true);
  };

  const handleSave = async () => {
    await handleSubmit(async (data) => {
      const isEdit = !!editingCustomer;
      const success = isEdit
        ? await updateCustomer(editingCustomer._id, data)
        : await createCustomer(data);

      if (success) {
        showToast.success(getSaveSuccessMessage(isEdit, dict));
        setShowModal(false);
        await fetchCustomers();
      } else {
        showToast.error(getSaveErrorMessage(dict));
      }
      return success;
    });
  };

  const handleDelete = async (customer: Customer) => {
    const confirmed = await confirm(
      dict?.admin?.deleteCustomer || 'Delete Customer',
      getDeleteConfirmMessage(dict),
      { variant: 'danger' }
    );
    if (!confirmed) return;

    const success = await deleteCustomer(customer._id);
    if (success) {
      showToast.success(getDeleteSuccessMessage(dict));
      await fetchCustomers();
    } else {
      showToast.error(getDeleteErrorMessage(dict));
    }
  };

  const handleToggleStatus = async (customer: Customer) => {
    const success = await toggleCustomerStatus(customer._id, !customer.isActive);
    if (success) {
      showToast.success(getToggleStatusMessage(!customer.isActive, dict));
      await fetchCustomers();
    } else {
      showToast.error(getToggleStatusErrorMessage(dict));
    }
  };

  const fetchBalancePaymentHistory = async (customerId: string) => {
    setBalanceHistoryLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/balance-payments?limit=10`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setBalancePaymentHistory(data.data || []);
      } else {
        setBalancePaymentHistory([]);
      }
    } catch {
      setBalancePaymentHistory([]);
    } finally {
      setBalanceHistoryLoading(false);
    }
  };

  const openBalancePayment = (customer: Customer) => {
    setBalancePayCustomer(customer);
    setBpAmount((Number(customer.accountBalance) || 0).toFixed(2));
    setBpMethod('cash');
    setBpNotes('');
    setBalancePaymentHistory([]);
    setBalancePayOpen(true);
    void fetchBalancePaymentHistory(customer._id);
  };

  const submitBalancePayment = async () => {
    if (!balancePayCustomer) return;
    const amt = parseFloat(bpAmount);
    if (!amt || amt <= 0 || Number.isNaN(amt)) {
      showToast.error(dict?.admin?.amount ? `${dict.admin.amount}: invalid` : 'Enter a valid amount');
      return;
    }
    setBpSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${balancePayCustomer._id}/balance-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: amt, method: bpMethod, notes: bpNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.admin?.balancePaymentRecorded || 'Payment recorded');
        const newBalance = Math.max(0, (Number(balancePayCustomer.accountBalance) || 0) - amt);
        setBalancePayCustomer({ ...balancePayCustomer, accountBalance: newBalance });
        setBpAmount(newBalance > 0 ? newBalance.toFixed(2) : '');
        await fetchBalancePaymentHistory(balancePayCustomer._id);
        await fetchCustomers();
        if (newBalance <= 0.01) {
          setBalancePayOpen(false);
          setBalancePayCustomer(null);
        }
      } else {
        showToast.error(data.error || dict?.admin?.balancePaymentFailed || 'Could not record payment');
      }
    } catch {
      showToast.error(dict?.admin?.balancePaymentFailed || 'Could not record payment');
    } finally {
      setBpSubmitting(false);
    }
  };

  const showBlockingLoader = !dict || (!initialLoadComplete && loading);

  if (showBlockingLoader) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {ConfirmDialog}
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {dict?.admin?.customers || 'Customers'}
              </h1>
              <p className="text-sm text-gray-500">{dict?.admin?.customersSubtitle || 'Manage your customer database'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6 relative">
          {loading && initialLoadComplete && (
            <div
              className="absolute inset-0 bg-white/70 flex items-center justify-center z-10"
              aria-busy="true"
              aria-live="polite"
            >
              <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand" />
            </div>
          )}
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <input
                type="text"
                placeholder={dict?.common?.search || 'Search...'}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand w-full sm:w-64"
              />
              <select
                value={filterActive}
                onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
              >
                <option value="all">{dict?.common?.all || 'All'}</option>
                <option value="true">{dict?.common?.active || 'Active'}</option>
                <option value="false">{dict?.common?.inactive || 'Inactive'}</option>
              </select>
            </div>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover whitespace-nowrap"
            >
              {dict?.common?.add || 'Add'} {dict?.admin?.customer || 'Customer'}
            </button>
            <Link
              href={`/${tenant}/${lang}/admin/file-upload`}
              className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium border border-gray-300 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {dict?.admin?.uploadFiles || 'Upload Files'}
            </Link>
          </div>

          {/* Table */}
          {customers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p>{dict?.common?.noCustomersFound || 'No customers found'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.name || 'Name'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.email || 'Email'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.phone || 'Phone'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.common?.totalSpent || 'Total Spent'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.balanceDueShort || 'Balance due'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.tags || 'Tags'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.admin?.status || 'Status'}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict?.common?.actions || 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <tr key={customer._id}>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {customer.firstName} {customer.lastName}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.email || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {customer.phone || '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(customer.totalSpent || 0, lang)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(Number(customer.accountBalance) || 0, lang)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex gap-1 flex-wrap">
                          {(customer.tags || []).slice(0, 3).map((tag, idx) => (
                            <span key={`${customer._id}-tag-${idx}-${tag}`} className="px-2 py-0.5 text-xs font-medium border border-gray-300 bg-gray-100 text-gray-700">
                              {tag}
                            </span>
                          ))}
                          {(customer.tags || []).length > 3 && (
                            <span className="text-xs text-gray-400">+{customer.tags!.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(customer)}
                          className={`px-2 py-1 text-xs font-semibold border ${getStatusBadgeClass(customer.isActive)}`}
                        >
                          {getStatusLabel(customer.isActive, dict)}
                        </button>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEdit(customer)}
                            className="text-brand hover:text-brand-navy font-medium"
                          >
                            {dict?.common?.edit || 'Edit'}
                          </button>
                          {enableOnAccountSales && customer.isActive && (Number(customer.accountBalance) || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => openBalancePayment(customer)}
                              className="text-emerald-700 hover:text-emerald-900 font-medium"
                            >
                              {dict?.admin?.recordBalancePayment || 'Record payment'}
                            </button>
                          )}
                          {customer.isActive && (
                            <button
                              onClick={() => handleDelete(customer)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              {dict?.common?.delete || 'Delete'}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-50"
              >
                {dict?.common?.previous || 'Previous'}
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-300 text-sm disabled:opacity-50"
              >
                {dict?.common?.next || 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Record balance payment */}
      {balancePayOpen && balancePayCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md border border-gray-300 shadow-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {dict?.admin?.recordBalancePaymentTitle || 'Record account payment'}
              </h3>
              <button
                type="button"
                onClick={() => { setBalancePayOpen(false); setBalancePayCustomer(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">{balancePayCustomer.firstName} {balancePayCustomer.lastName}</span>
                <span className="text-gray-500"> — {dict?.admin?.balanceDueShort || 'Balance due'}: </span>
                <span className="font-semibold">{formatCurrency(Number(balancePayCustomer.accountBalance) || 0, lang)}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{dict?.admin?.amount || 'Amount'}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={bpAmount}
                  onChange={(e) => setBpAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{dict?.admin?.paymentMethod || 'Payment method'}</label>
                <select
                  value={bpMethod}
                  onChange={(e) => setBpMethod(e.target.value as typeof bpMethod)}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand bg-white"
                >
                  <option value="cash">{dict?.pos?.cash || 'Cash'}</option>
                  <option value="card">{dict?.pos?.card || 'Card'}</option>
                  <option value="digital">{dict?.pos?.digital || 'Digital'}</option>
                  <option value="check">{dict?.pos?.check || 'Check'}</option>
                  <option value="other">{dict?.pos?.other || 'Other'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.common?.notes || 'Notes'} <span className="text-gray-400 font-normal">({dict?.admin?.balancePaymentNotesHint || 'optional'})</span>
                </label>
                <textarea
                  value={bpNotes}
                  onChange={(e) => setBpNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand resize-none"
                />
              </div>
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">
                  {dict?.admin?.balancePaymentHistory || 'Recent payments'}
                </h4>
                {balanceHistoryLoading ? (
                  <p className="text-xs text-gray-500">{dict?.common?.loading || 'Loading...'}</p>
                ) : balancePaymentHistory.length === 0 ? (
                  <p className="text-xs text-gray-500">{dict?.admin?.noBalancePayments || 'No payments recorded yet.'}</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {balancePaymentHistory.map((payment) => (
                      <li key={payment._id} className="flex items-start justify-between gap-3 text-xs border border-gray-100 px-2 py-1.5 bg-gray-50">
                        <div>
                          <span className="font-medium text-gray-900">{formatCurrency(payment.amount, lang)}</span>
                          <span className="text-gray-500"> · {payment.method}</span>
                          {payment.notes && <p className="text-gray-500 mt-0.5">{payment.notes}</p>}
                        </div>
                        <span className="text-gray-400 whitespace-nowrap">
                          {new Date(payment.createdAt).toLocaleDateString(lang === 'es' ? 'es' : 'en')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
              <button
                type="button"
                onClick={() => { setBalancePayOpen(false); setBalancePayCustomer(null); }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dict?.common?.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={submitBalancePayment}
                disabled={bpSubmitting}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 border border-emerald-700 disabled:opacity-50"
              >
                {bpSubmitting ? (dict?.common?.saving || 'Saving...') : (dict?.admin?.recordBalancePayment || 'Record payment')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg border border-gray-300">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingCustomer ? (dict?.common?.edit || 'Edit') : (dict?.common?.add || 'Add')} {dict?.admin?.customer || 'Customer'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.common?.firstName || 'First Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.common?.lastName || 'Last Name'} *
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.email || 'Email'}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.phone || 'Phone'}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.tags || 'Tags'} <span className="text-gray-400 font-normal">({dict?.common?.commaSeparated || 'comma separated'})</span>
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ tags: e.target.value })}
                  placeholder="VIP, Regular, Wholesale"
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.common?.notes || 'Notes'}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand resize-none"
                />
              </div>
              {enableOnAccountSales && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict?.admin?.creditLimit || dict?.components?.customerSidePanel?.creditLimit || 'Credit limit'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ creditLimit: e.target.value })}
                    placeholder={dict?.admin?.creditLimitPlaceholder || 'Leave empty for no limit'}
                    className="w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:border-brand"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {dict?.admin?.creditLimitHint || 'Maximum balance allowed for on-account sales.'}
                  </p>
                </div>
              )}
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {dict?.common?.cancel || 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white text-sm font-medium hover:bg-brand-hover border border-brand-hover disabled:opacity-50"
              >
                {submitting ? (dict?.common?.saving || 'Saving...') : (dict?.common?.save || 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
