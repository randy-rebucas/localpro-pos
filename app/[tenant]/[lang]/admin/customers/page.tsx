'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { useCustomersList, type Customer } from '@/hooks/useCustomersList';
import { useCustomersForm } from '@/hooks/useCustomersForm';
import {
  getStatusBadgeClass,
  getStatusLabel,
  getDeactivateConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getToggleStatusMessage,
  getToggleStatusErrorMessage,
  formatCurrency,
} from '@/lib/customers-helpers';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

export default function CustomersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any>>(null!); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balancePayOpen, setBalancePayOpen] = useState(false);
  const [balancePayCustomer, setBalancePayCustomer] = useState<Customer | null>(null);
  const [bpAmount, setBpAmount] = useState('');
  const [bpMethod, setBpMethod] = useState<'cash' | 'card' | 'digital' | 'check' | 'other'>('cash');
  const [bpNotes, setBpNotes] = useState('');
  const [bpSubmitting, setBpSubmitting] = useState(false);
  const [bpIdempotencyKey, setBpIdempotencyKey] = useState('');
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
  const enableLoyalty = supportsFeature(settings ?? undefined, 'loyalty');
  const { canAccess } = usePermissions();
  const canCreate = canAccess('customers.create');
  // Edit + reactivate are PATCH; deactivating is DELETE /api/customers/[id].
  const canEdit = canAccess('customers.update');
  const canDelete = canAccess('customers.delete');
  const canBalancePayments = canAccess('customers.balance_payments');

  const {
    customers,
    loading,
    error: listError,
    page,
    totalPages,
    total,
    limit,
    search,
    filterActive,
    setPage,
    setSearch,
    setFilterActive,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    toggleCustomerStatus,
  } = useCustomersList();

  const { formData, setFormData, error, submitting, handleSubmit, resetForm, initializeForm } = useCustomersForm();

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(async (data) => {
      const isEdit = !!editingCustomer;
      const result = isEdit
        ? await updateCustomer(editingCustomer._id, data)
        : await createCustomer(data);

      if (result === true) {
        showToast.success(getSaveSuccessMessage(isEdit, dict));
        setShowModal(false);
        await fetchCustomers();
      } else {
        showToast.error(result || getSaveErrorMessage(dict));
      }
      return result;
    });
  };

  const handleDelete = async (customer: Customer) => {
    const name = `${customer.firstName} ${customer.lastName}`.trim();
    if (!confirm(getDeactivateConfirmMessage(name, dict))) return;

    setBusyId(customer._id);
    const result = await deleteCustomer(customer._id);
    setBusyId(null);
    if (result === true) {
      showToast.success(getDeleteSuccessMessage(dict));
      await fetchCustomers();
    } else {
      showToast.error(result || getDeleteErrorMessage(dict));
    }
  };

  const handleToggleStatus = async (customer: Customer) => {
    setBusyId(customer._id);
    const result = await toggleCustomerStatus(customer._id, !customer.isActive);
    setBusyId(null);
    if (result === true) {
      showToast.success(getToggleStatusMessage(!customer.isActive, dict));
      await fetchCustomers();
    } else {
      showToast.error(result || getToggleStatusErrorMessage(dict));
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
    setBpIdempotencyKey(crypto.randomUUID());
    setBalancePayOpen(true);
    void fetchBalancePaymentHistory(customer._id);
  };

  // Keep balancePayCustomer set while the drawer slides out so its header doesn't blank.
  const closeBalancePayment = () => setBalancePayOpen(false);

  const submitBalancePayment = async (e: React.FormEvent) => {
    e.preventDefault();
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
        body: JSON.stringify({ amount: amt, method: bpMethod, notes: bpNotes.trim() || undefined, idempotencyKey: bpIdempotencyKey }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict?.admin?.balancePaymentRecorded || 'Payment recorded');
        const newBalance = Math.max(0, (Number(balancePayCustomer.accountBalance) || 0) - amt);
        setBalancePayCustomer({ ...balancePayCustomer, accountBalance: newBalance });
        setBpAmount(newBalance > 0 ? newBalance.toFixed(2) : '');
        setBpIdempotencyKey(crypto.randomUUID());
        await fetchBalancePaymentHistory(balancePayCustomer._id);
        await fetchCustomers();
        if (newBalance <= 0.01) {
          closeBalancePayment();
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

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const hasFilters = !!search.trim() || filterActive !== 'all';
  const editLabel = dict.common?.edit || 'Edit';
  const deactivateLabel = dict.admin?.deactivate || 'Deactivate';
  const activateLabel = dict.admin?.activate || 'Activate';
  const recordPaymentLabel = dict.admin?.recordBalancePayment || 'Record payment';
  const closeLabel = dict.common?.close || 'Close';

  const renderBody = () => {
    if (loading && customers.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingCustomers || 'Loading customers…'}</p>
        </div>
      );
    }

    if (listError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{dict.admin?.failedToLoadCustomers || 'Failed to load customers'}</p>
          <p className="text-xs text-gray-500 mt-1">{listError}</p>
          <button
            type="button"
            onClick={() => fetchCustomers()}
            disabled={loading}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {loading ? (dict.common?.loading || 'Loading…') : (dict.common?.retry || 'Retry')}
          </button>
        </div>
      );
    }

    if (customers.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noCustomersMatch || 'No customers match your filters.')
            : (dict.admin?.noCustomersYet || 'No customers yet.')}
        </div>
      );
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return (
      <div className="relative border border-gray-300 bg-white" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20" aria-live="polite">
            <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
          </div>
        )}
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.phone || 'Phone'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.totalSpent || 'Total Spent'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.balanceDueShort || 'Balance due'}</th>
                {enableLoyalty && (
                  <th className="px-4 py-3 text-right font-medium">{dict.admin?.loyaltyPoints || 'Loyalty Points'}</th>
                )}
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.tags || 'Tags'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((customer) => {
                const name = `${customer.firstName} ${customer.lastName}`.trim();
                const balance = Number(customer.accountBalance) || 0;
                const busy = busyId === customer._id;
                const canRecordPayment = canBalancePayments && enableOnAccountSales && customer.isActive && balance > 0;
                const tags = customer.tags || [];
                return (
                  <tr key={customer._id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 whitespace-nowrap">{name}</p>
                      <p className="text-xs text-gray-500 max-w-[240px] truncate" title={customer.email || undefined}>
                        {customer.email || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700 tabular-nums">{customer.phone || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                      {formatCurrency(customer.totalSpent || 0, lang)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right tabular-nums ${balance > 0 ? 'font-semibold text-win8-danger' : 'text-gray-900'}`}>
                      {formatCurrency(balance, lang)}
                    </td>
                    {enableLoyalty && (
                      <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                        {(customer.loyaltyPointsBalance ?? 0).toLocaleString()}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {tags.length === 0 ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {tags.slice(0, 3).map((tag, idx) => (
                            <span key={`${customer._id}-tag-${idx}-${tag}`} className="px-1.5 py-0.5 text-xs font-medium border border-gray-300 bg-gray-100 text-gray-700">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 3 && (
                            <span className="text-xs text-gray-500" title={tags.slice(3).join(', ')}>+{tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusBadgeClass(customer.isActive)}`}>
                        {getStatusLabel(customer.isActive, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!canEdit && !canDelete && !canRecordPayment ? (
                        <div className="text-right text-gray-400">—</div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(customer)}
                              title={editLabel}
                              aria-label={`${editLabel}: ${name}`}
                              className={`${ICON_BUTTON} bg-brand`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                              </svg>
                            </button>
                          )}
                          {canRecordPayment && (
                            <button
                              type="button"
                              onClick={() => openBalancePayment(customer)}
                              title={recordPaymentLabel}
                              aria-label={`${recordPaymentLabel}: ${name}`}
                              className={`${ICON_BUTTON} bg-win8-success`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 10v.01M18 14v.01" />
                              </svg>
                            </button>
                          )}
                          {canDelete && customer.isActive && (
                            <button
                              type="button"
                              onClick={() => handleDelete(customer)}
                              disabled={busy}
                              title={deactivateLabel}
                              aria-label={`${deactivateLabel}: ${name}`}
                              className={`${ICON_BUTTON} bg-win8-danger`}
                            >
                              {busy ? SPINNER_SM : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                                </svg>
                              )}
                            </button>
                          )}
                          {canEdit && !customer.isActive && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(customer)}
                              disabled={busy}
                              title={activateLabel}
                              aria-label={`${activateLabel}: ${name}`}
                              className={`${ICON_BUTTON} bg-win8-success`}
                            >
                              {busy ? SPINNER_SM : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {dict.admin?.showing || 'Showing'} {start.toLocaleString()}–{end.toLocaleString()} {dict.admin?.of || 'of'} {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
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
          title={dict.admin?.customers || 'Customers'}
          description={dict.admin?.customersSubtitle || 'Manage your customer database'}
          actions={
            <Link
              href={`/${tenant}/${lang}/admin/file-upload`}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {dict.admin?.uploadFiles || 'Upload Files'}
            </Link>
          }
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="flex gap-3 flex-wrap">
              <div className="relative">
                <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                </svg>
                <input
                  type="text"
                  placeholder={dict.admin?.searchCustomers || 'Search customers…'}
                  aria-label={dict.admin?.searchCustomers || 'Search customers…'}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-full sm:w-64"
                />
              </div>
              <select
                aria-label={dict.admin?.filterByStatus || 'Filter by Status'}
                value={filterActive}
                onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="all">{dict.common?.all || 'All'}</option>
                <option value="true">{dict.common?.active || 'Active'}</option>
                <option value="false">{dict.common?.inactive || 'Inactive'}</option>
              </select>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
              >
                + {dict.admin?.newCustomer || 'New Customer'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      {/* Record balance payment */}
      <Win8Drawer open={balancePayOpen && !!balancePayCustomer} onClose={closeBalancePayment}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">
            {dict.admin?.recordBalancePaymentTitle || 'Record account payment'}
          </h2>
          <button
            type="button"
            onClick={closeBalancePayment}
            title={closeLabel}
            aria-label={closeLabel}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {balancePayCustomer && (
          <form onSubmit={submitBalancePayment} className="flex flex-col flex-1 min-h-0">
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
                <p className="font-semibold">{balancePayCustomer.firstName} {balancePayCustomer.lastName}</p>
                <p className="mt-0.5">
                  {dict.admin?.balanceDueShort || 'Balance due'}:{' '}
                  <span className="font-semibold tabular-nums">{formatCurrency(Number(balancePayCustomer.accountBalance) || 0, lang)}</span>
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bp-amount" className={LABEL}>
                    {dict.admin?.amount || 'Amount'} <span className="text-win8-danger">*</span>
                  </label>
                  <input
                    id="bp-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={bpAmount}
                    onChange={(e) => setBpAmount(e.target.value)}
                    className={`${INPUT} tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="bp-method" className={LABEL}>{dict.admin?.paymentMethod || 'Payment method'}</label>
                  <select
                    id="bp-method"
                    value={bpMethod}
                    onChange={(e) => setBpMethod(e.target.value as typeof bpMethod)}
                    className={INPUT}
                  >
                    <option value="cash">{dict.pos?.cash || 'Cash'}</option>
                    <option value="card">{dict.pos?.card || 'Card'}</option>
                    <option value="digital">{dict.pos?.digital || 'Digital'}</option>
                    <option value="check">{dict.pos?.check || 'Check'}</option>
                    <option value="other">{dict.pos?.other || 'Other'}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="bp-notes" className={LABEL}>
                  {dict.common?.notes || 'Notes'} <span className="text-gray-400 font-normal">({dict.common?.optional || 'optional'})</span>
                </label>
                <textarea
                  id="bp-notes"
                  value={bpNotes}
                  onChange={(e) => setBpNotes(e.target.value)}
                  rows={2}
                  placeholder={dict.admin?.balancePaymentNotesHint || ''}
                  className={`${INPUT} resize-none`}
                />
              </div>
              <hr className="border-gray-300" />
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {dict.admin?.balancePaymentHistory || 'Recent payments'}
                </p>
                {balanceHistoryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="win8-spinner win8-spinner-sm text-brand"><span /><span /><span /><span /><span /></span>
                    {dict.common?.loading || 'Loading…'}
                  </div>
                ) : balancePaymentHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">{dict.admin?.noBalancePayments || 'No payments recorded yet.'}</p>
                ) : (
                  <ul className="border border-gray-300 divide-y divide-gray-200 max-h-60 overflow-y-auto">
                    {balancePaymentHistory.map((payment) => (
                      <li key={payment._id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-900 tabular-nums">{formatCurrency(payment.amount, lang)}</span>
                          <span className="text-xs text-gray-500 capitalize"> · {payment.method}</span>
                          {payment.notes && <p className="text-xs text-gray-500 mt-0.5 break-words">{payment.notes}</p>}
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap tabular-nums">
                          {new Date(payment.createdAt).toLocaleDateString(lang === 'es' ? 'es' : 'en')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
              <button
                type="button"
                onClick={closeBalancePayment}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={bpSubmitting}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {bpSubmitting ? (dict.common?.saving || 'Saving…') : recordPaymentLabel}
              </button>
            </div>
          </form>
        )}
      </Win8Drawer>

      {/* Create/Edit */}
      <Win8Drawer open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">
            {editingCustomer
              ? (dict.admin?.editCustomer || 'Edit Customer')
              : (dict.admin?.newCustomer || 'New Customer')}
          </h2>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            title={closeLabel}
            aria-label={closeLabel}
            className="text-white/70 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="customer-first-name" className={LABEL}>
                  {dict.common?.firstName || 'First Name'} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="customer-first-name"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ firstName: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="customer-last-name" className={LABEL}>
                  {dict.common?.lastName || 'Last Name'} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="customer-last-name"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ lastName: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="customer-email" className={LABEL}>{dict.admin?.email || 'Email'}</label>
                <input
                  id="customer-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ email: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="customer-phone" className={LABEL}>{dict.admin?.phone || 'Phone'}</label>
                <input
                  id="customer-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ phone: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>
            <hr className="border-gray-300" />
            <div>
              <label htmlFor="customer-tags" className={LABEL}>
                {dict.admin?.tags || 'Tags'} <span className="text-gray-400 font-normal">({dict.common?.commaSeparated || 'comma separated'})</span>
              </label>
              <input
                id="customer-tags"
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ tags: e.target.value })}
                placeholder="VIP, Regular, Wholesale"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="customer-notes" className={LABEL}>{dict.common?.notes || 'Notes'}</label>
              <textarea
                id="customer-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ notes: e.target.value })}
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>
            {enableOnAccountSales && (
              <div>
                <label htmlFor="customer-credit-limit" className={LABEL}>
                  {dict.admin?.creditLimit || dict.components?.customerSidePanel?.creditLimit || 'Credit limit'}
                </label>
                <input
                  id="customer-credit-limit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ creditLimit: e.target.value })}
                  placeholder={dict.admin?.creditLimitPlaceholder || 'Leave empty for no limit'}
                  className={`${INPUT} tabular-nums`}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {dict.admin?.creditLimitHint || 'Maximum balance allowed for on-account sales.'}
                </p>
              </div>
            )}
            {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
