'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { HandCoins, Pencil, Plus, Power, Search, Upload, Users } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, HINT, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet,
} from '@/components/admin/register-ui';
import { useCustomersList, type Customer } from '@/hooks/useCustomersList';
import { useCustomersForm } from '@/hooks/useCustomersForm';
import {
  getStatusLabel,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getToggleStatusMessage,
  getToggleStatusErrorMessage,
} from '@/lib/customers-helpers';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDate } from '@/lib/formatting';
import { usePermissions } from '@/hooks/usePermissions';

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type PaymentMethod = 'cash' | 'card' | 'digital' | 'check' | 'other';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'digital', 'check', 'other'];

const TH = 'px-3 py-2 align-bottom font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-3 py-3 font-receipt text-sm';
/** Cells holding written words rather than printed figures. */
const TD_TEXT = 'px-3 py-3 text-sm';

const methodLabel = (dict: Dict, method: string) =>
  ({
    cash: dict.admin?.cash || 'Cash',
    card: dict.admin?.card || 'Card',
    digital: dict.admin?.digital || 'Digital',
    check: dict.admin?.check || 'Check',
    other: dict.admin?.other || 'Other',
  } as Record<string, string>)[method] || method;

const fullName = (customer: Customer) => `${customer.firstName} ${customer.lastName}`.trim();
const balanceOf = (customer: Customer) => Number(customer.accountBalance) || 0;

function StatusTag({ dict, active }: { dict: Dict; active: boolean }) {
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-receipt text-[11px] uppercase ${active ? 'border-ink/25 text-ink/70' : 'border-stamp/50 text-stamp'}`}>
      {getStatusLabel(active, dict)}
    </span>
  );
}

function Tags({ customer }: { customer: Customer }) {
  const tags = customer.tags || [];
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag, idx) => (
        <span key={`${customer._id}-tag-${idx}-${tag}`} className="border border-dashed border-ink/30 px-1.5 py-0.5 font-receipt text-[11px] text-ink/70">
          {tag}
        </span>
      ))}
      {tags.length > 3 && <span className="font-receipt text-[11px] text-ink/50">+{tags.length - 3}</span>}
    </span>
  );
}

/** Money owed on account reads in stamp red; a clear account stays quiet. */
function Balance({ amount }: { amount: number }) {
  return <span className={amount > 0 ? 'font-semibold text-stamp' : 'text-ink/50'}><Currency amount={amount} /></span>;
}

export default function CustomersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [balancePayOpen, setBalancePayOpen] = useState(false);
  const [balancePayCustomer, setBalancePayCustomer] = useState<Customer | null>(null);
  const [bpAmount, setBpAmount] = useState('');
  const [bpMethod, setBpMethod] = useState<PaymentMethod>('cash');
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
  const [busyId, setBusyId] = useState<string | null>(null);

  const { settings } = useTenantSettings();
  const dateSettings = settings || getDefaultTenantSettings();
  const enableOnAccountSales = settings?.enableOnAccountSales === true;
  const enableLoyalty = supportsFeature(settings ?? undefined, 'loyalty');
  const { canAccess } = usePermissions();
  const canManage = canAccess('customers.manage');
  const canEdit = canAccess('customers.edit');
  const canBalancePayments = canAccess('customers.balance_payments');

  const {
    customers,
    loading,
    page,
    totalPages,
    total,
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

  // Deleting a customer is a soft delete: it deactivates the account and keeps its history.
  const handleDeactivate = async (customer: Customer) => {
    const confirmed = await confirm(
      dict?.admin?.deactivateCustomerTitle || 'Deactivate customer?',
      `${getDeleteConfirmMessage(dict)} (${fullName(customer)})`,
      { variant: 'danger', confirmText: dict?.admin?.deactivate || 'Deactivate', cancelText: dict?.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

    setBusyId(customer._id);
    try {
      const result = await deleteCustomer(customer._id);
      if (result === true) {
        showToast.success(getDeleteSuccessMessage(dict));
        await fetchCustomers();
      } else {
        showToast.error(result || getDeleteErrorMessage(dict));
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = async (customer: Customer) => {
    setBusyId(customer._id);
    try {
      const result = await toggleCustomerStatus(customer._id, true);
      if (result === true) {
        showToast.success(getToggleStatusMessage(true, dict));
        await fetchCustomers();
      } else {
        showToast.error(result || getToggleStatusErrorMessage(dict));
      }
    } finally {
      setBusyId(null);
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
    setBpAmount(balanceOf(customer).toFixed(2));
    setBpMethod('cash');
    setBpNotes('');
    setBalancePaymentHistory([]);
    setBpIdempotencyKey(crypto.randomUUID());
    setBalancePayOpen(true);
    void fetchBalancePaymentHistory(customer._id);
  };

  const closeBalancePayment = () => {
    setBalancePayOpen(false);
    setBalancePayCustomer(null);
  };

  const submitBalancePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balancePayCustomer) return;
    const amt = parseFloat(bpAmount);
    if (!amt || amt <= 0 || Number.isNaN(amt)) {
      showToast.error(dict?.admin?.enterValidAmount || 'Enter a valid amount');
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
        const newBalance = Math.max(0, balanceOf(balancePayCustomer) - amt);
        setBalancePayCustomer({ ...balancePayCustomer, accountBalance: newBalance });
        setBpAmount(newBalance > 0 ? newBalance.toFixed(2) : '');
        setBpIdempotencyKey(crypto.randomUUID());
        await fetchBalancePaymentHistory(balancePayCustomer._id);
        await fetchCustomers();
        if (newBalance <= 0.01) closeBalancePayment();
      } else {
        showToast.error(data.error || dict?.admin?.balancePaymentFailed || 'Could not record payment');
      }
    } catch {
      showToast.error(dict?.admin?.balancePaymentFailed || 'Could not record payment');
    } finally {
      setBpSubmitting(false);
    }
  };

  if (!dict || !initialLoadComplete) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.customers || 'Customers';
  // Keep the balance visible while anyone still owes, even if on-account sales were switched off later.
  const showBalance = enableOnAccountSales || customers.some((c) => balanceOf(c) > 0);
  const canTakePayment = (customer: Customer) =>
    canBalancePayments && enableOnAccountSales && customer.isActive && balanceOf(customer) > 0;
  const statusKeys = [
    { value: 'all', label: dict.common?.all || 'All' },
    { value: 'true', label: dict.common?.active || 'Active' },
    { value: 'false', label: dict.common?.inactive || 'Inactive' },
  ];
  const editLabel = dict.common?.edit || 'Edit';
  const payLabel = dict.admin?.recordBalancePayment || 'Record payment';
  const deactivateLabel = dict.admin?.deactivate || 'Deactivate';
  const activateLabel = dict.admin?.activate || 'Activate';

  /** The keys at the end of a customer's line. */
  const rowKeys = (customer: Customer) => (
    <>
      {canTakePayment(customer) && (
        <button type="button" onClick={() => openBalancePayment(customer)} className={ROW_KEY} aria-label={`${payLabel}: ${fullName(customer)}`} title={payLabel}>
          <HandCoins className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {canEdit && (
        <button type="button" onClick={() => openEdit(customer)} className={ROW_KEY} aria-label={`${editLabel} ${fullName(customer)}`} title={editLabel}>
          <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => (customer.isActive ? handleDeactivate(customer) : handleActivate(customer))}
          disabled={busyId === customer._id}
          className={`${ROW_KEY} ${customer.isActive ? 'hover:text-stamp' : 'hover:text-brand-hover'} disabled:opacity-40`}
          aria-label={`${customer.isActive ? deactivateLabel : activateLabel} ${fullName(customer)}`}
          title={customer.isActive ? deactivateLabel : activateLabel}
        >
          <Power className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </>
  );

  return (
    <RegisterPage
      tagNo="CU"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.admin?.customersSubtitle || 'Manage your customer database'}
      side={<LedReadout value={total} label={dict.admin?.customers || 'Customers'} />}
    >
      {ConfirmDialog}

      {/* Find a customer, narrow by status, or open a new account */}
      <div className="mt-6 grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div>
          <label htmlFor="customer-search" className={DARK_LABEL}>{dict.common?.search || 'Search'}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
            <input
              id="customer-search"
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={dict.admin?.customerSearchPlaceholder || 'Name, email or phone'}
              className={`${DARK_FIELD} pl-9`}
            />
          </div>
        </div>
        <nav aria-label={dict.admin?.status || 'Status'} className="grid grid-cols-3 border-l border-t border-white/25">
          {statusKeys.map((key) => (
            <button
              key={key.value}
              type="button"
              aria-pressed={filterActive === key.value}
              onClick={() => { setFilterActive(key.value); setPage(1); }}
              className={`flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-3 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${filterActive === key.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
            >
              {key.label}
            </button>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Link href={`/${tenant}/${lang}/admin/file-upload`} className={DARK_KEY}>
            <Upload className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.uploadFiles || 'Upload Files'}
          </Link>
          {canManage && (
            <button type="button" onClick={openCreate} className={DARK_KEY_PRIMARY}>
              <Plus className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.admin?.addCustomer || 'Add customer'}
            </button>
          )}
        </div>
      </div>

      {/* The customer book, one line per account */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {customers.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.common?.noCustomersFound || 'No customers found'}</p>
              {canManage && !search && filterActive === 'all' && (
                <button type="button" onClick={openCreate} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addCustomer || 'Add customer'}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Up to xl: stacked lines */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {customers.map((customer) => (
                  <li key={customer._id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className={`min-w-0 text-sm font-medium ${customer.isActive ? '' : 'text-ink/50'}`}>{fullName(customer)}</p>
                        <p className="shrink-0 text-right font-receipt text-sm"><Currency amount={customer.totalSpent || 0} /></p>
                      </div>
                      {customer.phone && <p className="mt-0.5 font-receipt text-xs text-ink/60">{customer.phone}</p>}
                      {customer.email && <p className="mt-0.5 font-receipt text-xs text-ink/60 [overflow-wrap:anywhere]">{customer.email}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                        {!customer.isActive && <StatusTag dict={dict} active={false} />}
                        {showBalance && balanceOf(customer) > 0 && (
                          <span>{dict.admin?.balanceDueShort || 'Balance due'}: <Balance amount={balanceOf(customer)} /></span>
                        )}
                        {enableLoyalty && (
                          <span>{dict.admin?.loyaltyPoints || 'Loyalty points'}: <span className="text-ink">{(customer.loyaltyPointsBalance ?? 0).toLocaleString()}</span></span>
                        )}
                        <Tags customer={customer} />
                      </div>
                    </div>
                    <div className="-mr-2 flex shrink-0">{rowKeys(customer)}</div>
                  </li>
                ))}
              </ul>

              {/* From xl: the full book */}
              <div className="relative hidden overflow-x-auto xl:block" role="region" aria-label={title} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.name || 'Name'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.tags || 'Tags'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.common?.totalSpent || 'Total Spent'}</th>
                      {showBalance && <th scope="col" className={`${TH} text-right`}>{dict.admin?.balanceDueShort || 'Balance due'}</th>}
                      {enableLoyalty && <th scope="col" className={`${TH} text-right`}>{dict.admin?.loyaltyPoints || 'Loyalty points'}</th>}
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.status || 'Status'}</th>
                      {(canEdit || canBalancePayments) && <th scope="col" className={TH}><span className="sr-only">{dict.common?.actions || 'Actions'}</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {customers.map((customer) => (
                      <tr key={customer._id} className="align-top transition-colors hover:bg-paper">
                        <td className={`${TD_TEXT} min-w-[14rem]`}>
                          <p className={`font-medium ${customer.isActive ? '' : 'text-ink/50'}`}>{fullName(customer)}</p>
                          {(customer.email || customer.phone) && (
                            <p className="mt-0.5 font-receipt text-xs text-ink/60">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</p>
                          )}
                        </td>
                        <td className={TD}><Tags customer={customer} /></td>
                        <td className={`${TD} whitespace-nowrap text-right`}><Currency amount={customer.totalSpent || 0} /></td>
                        {showBalance && (
                          <td className={`${TD} whitespace-nowrap text-right`}>
                            <Balance amount={balanceOf(customer)} />
                            {enableOnAccountSales && customer.creditLimit != null && (
                              <p className="mt-0.5 text-xs text-ink/50">
                                {dict.admin?.creditLimit || 'Credit limit'}: <Currency amount={customer.creditLimit} />
                              </p>
                            )}
                          </td>
                        )}
                        {enableLoyalty && (
                          <td className={`${TD} whitespace-nowrap text-right`}>{(customer.loyaltyPointsBalance ?? 0).toLocaleString()}</td>
                        )}
                        <td className={TD}><StatusTag dict={dict} active={customer.isActive} /></td>
                        {(canEdit || canBalancePayments) && (
                          <td className="whitespace-nowrap px-2 py-1 text-right">
                            <div className="inline-flex">{rowKeys(customer)}</div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <SlipPager
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            label={dict.admin?.page || 'Page'}
            previousLabel={dict.common?.previous || 'Previous'}
            nextLabel={dict.common?.next || 'Next'}
          />
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

      {/* Account payment slip */}
      {balancePayOpen && balancePayCustomer && (
        <Sheet
          title={dict.admin?.recordBalancePaymentTitle || 'Record account payment'}
          subtitle={fullName(balancePayCustomer)}
          onClose={closeBalancePayment}
          closeLabel={dict.common?.close || 'Close'}
          footer={
            <>
              <button type="button" onClick={closeBalancePayment} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
              <button type="submit" form="balance-payment-form" disabled={bpSubmitting} className={KEY_PRIMARY}>
                <HandCoins className={ICON} strokeWidth={1.75} aria-hidden />
                {bpSubmitting ? (dict.common?.saving || 'Saving...') : payLabel}
              </button>
            </>
          }
        >
          <form id="balance-payment-form" onSubmit={submitBalancePayment} className="space-y-4">
            <div className="font-receipt text-lg">
              <ReceiptRow strong label={dict.admin?.balanceDueShort || 'Balance due'} value={<Balance amount={balanceOf(balancePayCustomer)} />} />
            </div>

            <div>
              <label htmlFor="bp-amount" className={LABEL}>{dict.admin?.amount || 'Amount'}</label>
              <input
                id="bp-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={bpAmount}
                onChange={(e) => setBpAmount(e.target.value)}
                className={`${INPUT} font-receipt`}
              />
            </div>

            <fieldset>
              <legend className={LABEL}>{dict.admin?.paymentMethod || 'Payment method'}</legend>
              <div className="grid grid-cols-3 border-l border-t border-ink/25 sm:grid-cols-5">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={bpMethod === method}
                    onClick={() => setBpMethod(method)}
                    className={`flex min-h-[44px] items-center justify-center border-b border-r border-ink/25 px-1 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${bpMethod === method ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                  >
                    {methodLabel(dict, method)}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="bp-notes" className={LABEL}>
                {dict.common?.notes || 'Notes'} ({dict.common?.optional || 'optional'})
              </label>
              <textarea id="bp-notes" value={bpNotes} onChange={(e) => setBpNotes(e.target.value)} rows={2} className={`${INPUT} resize-none`} />
            </div>

            <div className="border-t border-dashed border-ink/30 pt-4">
              <h3 className="font-receipt text-xs font-medium uppercase tracking-[0.08em] text-ink/60">
                {dict.admin?.balancePaymentHistory || 'Recent payments'}
              </h3>
              {balanceHistoryLoading ? (
                <p className="mt-2 font-receipt text-xs text-ink/60">{dict.common?.loading || 'Loading...'}</p>
              ) : balancePaymentHistory.length === 0 ? (
                <p className="mt-2 font-receipt text-xs text-ink/60">{dict.admin?.noBalancePayments || 'No payments recorded yet.'}</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto font-receipt text-sm">
                  {balancePaymentHistory.map((payment) => (
                    <li key={payment._id}>
                      <ReceiptRow
                        label={`${formatDate(payment.createdAt, dateSettings)} · ${methodLabel(dict, payment.method)}`}
                        value={<Currency amount={payment.amount} />}
                      />
                      {payment.notes && <p className="text-xs text-ink/60">{payment.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </form>
        </Sheet>
      )}

      {/* Customer card */}
      {showModal && (
        <Sheet
          title={editingCustomer ? (dict.admin?.editCustomer || 'Edit customer') : (dict.admin?.addCustomer || 'Add customer')}
          onClose={() => setShowModal(false)}
          closeLabel={dict.common?.close || 'Close'}
          footer={
            <>
              <button type="button" onClick={() => setShowModal(false)} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
              <button type="submit" form="customer-form" disabled={submitting} className={KEY_PRIMARY}>
                {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </>
          }
        >
          <form id="customer-form" onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="customer-first" className={LABEL}>{dict.common?.firstName || 'First Name'} *</label>
                <input id="customer-first" type="text" value={formData.firstName} onChange={(e) => setFormData({ firstName: e.target.value })} className={INPUT} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="customer-last" className={LABEL}>{dict.common?.lastName || 'Last Name'} *</label>
                <input id="customer-last" type="text" value={formData.lastName} onChange={(e) => setFormData({ lastName: e.target.value })} className={INPUT} autoComplete="off" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="customer-phone" className={LABEL}>{dict.admin?.phone || 'Phone'}</label>
                <input id="customer-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ phone: e.target.value })} className={`${INPUT} font-receipt`} autoComplete="off" />
              </div>
              <div>
                <label htmlFor="customer-email" className={LABEL}>{dict.admin?.email || 'Email'}</label>
                <input id="customer-email" type="email" value={formData.email} onChange={(e) => setFormData({ email: e.target.value })} className={INPUT} autoComplete="off" />
              </div>
            </div>
            <div>
              <label htmlFor="customer-tags" className={LABEL}>
                {dict.admin?.tags || 'Tags'} ({dict.common?.commaSeparated || 'comma separated'})
              </label>
              <input id="customer-tags" type="text" value={formData.tags} onChange={(e) => setFormData({ tags: e.target.value })} placeholder="VIP, Regular, Wholesale" className={INPUT} />
            </div>
            <div>
              <label htmlFor="customer-notes" className={LABEL}>{dict.common?.notes || 'Notes'}</label>
              <textarea id="customer-notes" value={formData.notes} onChange={(e) => setFormData({ notes: e.target.value })} rows={3} className={`${INPUT} resize-none`} />
            </div>
            {enableOnAccountSales && (
              <div>
                <label htmlFor="customer-credit" className={LABEL}>
                  {dict.admin?.creditLimit || dict.components?.customerSidePanel?.creditLimit || 'Credit limit'}
                </label>
                <input
                  id="customer-credit"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ creditLimit: e.target.value })}
                  placeholder={dict.admin?.creditLimitPlaceholder || 'Leave empty for no limit'}
                  className={`${INPUT} font-receipt`}
                />
                <p className={HINT}>{dict.admin?.creditLimitHint || 'Maximum balance allowed for on-account sales.'}</p>
              </div>
            )}
            {error && (
              <div role="alert" className="border-l-4 border-stamp bg-white px-4 py-3 font-receipt text-sm text-ink">{error}</div>
            )}
          </form>
        </Sheet>
      )}
    </RegisterPage>
  );
}
