'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import Currency from '@/components/Currency';
import { showToast } from '@/lib/toast';
import { formatCurrency } from '@/lib/currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useDepositList, type Deposit } from '@/hooks/useDepositList';
import { useDepositForm } from '@/hooks/useDepositForm';
import { useWorkOrderList } from '@/hooks/useWorkOrderList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getDepositStatusColor,
  getDepositStatusLabel,
  getAllowedNextDepositStatuses,
  type DepositStatus,
} from '@/lib/deposit-helpers';
import { getInvoiceStatusLabel, type InvoiceStatus } from '@/lib/invoice-helpers';

interface BookingOption {
  id: string;
  serviceName: string;
  customerName: string;
  startTime: string;
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  total: string | number;
  status: string;
  customer?: { firstName: string; lastName: string } | null;
}

/** A deposit can only be applied to an invoice that is still open. */
const OPEN_INVOICE_STATUSES = ['draft', 'sent', 'overdue'];

type DepositAction = 'paid' | 'applied' | 'refunded' | 'forfeited' | 'cancel';

const STATUS_FILTERS: DepositStatus[] = ['pending', 'paid', 'applied', 'refunded', 'forfeited', 'cancelled'];
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';
const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const ACTION_BUTTON = 'px-4 py-2 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-[filter]';

export default function DepositsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings } = useTenantSettings();

  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
  const [invoiceIdInput, setInvoiceIdInput] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [actionBusy, setActionBusy] = useState<DepositAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('deposits.create');
  // Mark paid / cancel / apply to invoice are edits; refund + forfeit need deposits.refund only.
  const canEdit = canAccess('deposits.edit');
  const canRefund = canAccess('deposits.refund');

  const { deposits, loading, error: listError, fetchDeposits, updateDeposit, cancelDeposit } = useDepositList(tenant, {
    status: filterStatus,
  });
  const { formData, setFormData, submitting, error: formError, handleSubmit: submitForm, resetForm } = useDepositForm(tenant);
  const { workOrders, fetchWorkOrders } = useWorkOrderList(tenant, { status: 'all', assignedToId: 'all' });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // List errors render inline (with Retry) instead of as a toast.
  useEffect(() => {
    fetchDeposits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  useEffect(() => {
    fetchWorkOrders();
    (async () => {
      try {
        const res = await globalThis.fetch(`/api/bookings?tenant=${tenant}`, { credentials: 'include' });
        const data = await res.json();
        if (data.success) setBookingOptions(data.data || []);
      } catch {
        // Non-fatal: create-deposit modal falls back to manual IDs if this fails.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (amount: string | number | null | undefined) => {
    const n = Number(amount ?? 0);
    return settings ? formatCurrency(n, settings) : n.toFixed(2);
  };
  const customerName = (d: Deposit) =>
    d.customer ? `${d.customer.firstName} ${d.customer.lastName}`.trim() : d.booking?.customerName || '';
  const linkedLabel = (d: Deposit) => d.booking?.serviceName || d.workOrder?.title || '';
  const fill = (template: string, d: Deposit, amount?: string) =>
    template
      .replace('{amount}', amount ?? money(d.amount))
      .replace('{customer}', customerName(d) || (dict?.admin?.customer || 'the customer'));
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString(lang === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const openDetail = (deposit: Deposit) => {
    setSelectedDeposit(deposit);
    setInvoiceIdInput(deposit.invoiceId || '');
    setRefundAmountInput('');
    setActionError(null);
    setShowAllInvoices(false);
    setShowModal(true);
  };

  const closeDetail = () => setShowModal(false);

  const openCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  // Open invoices a paid deposit can be applied to: the deposit's customer by
  // default, or every customer when the user asks for it.
  const depositCustomerId = selectedDeposit?.customerId || selectedDeposit?.customer?.id || null;
  const needsInvoicePicker = showModal && canEdit && selectedDeposit?.status === 'paid';
  useEffect(() => {
    if (!needsInvoicePicker) return;
    const controller = new AbortController();
    const scopeToCustomer = !!depositCustomerId && !showAllInvoices;
    setInvoicesLoading(true);
    setInvoicesError(false);
    const qs = new URLSearchParams({ tenant, limit: '100' });
    if (scopeToCustomer) qs.set('customerId', depositCustomerId as string);
    globalThis
      .fetch(`/api/invoices?${qs}`, { credentials: 'include', signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        const rows: InvoiceOption[] = data.data || [];
        setInvoiceOptions(rows.filter((inv) => OPEN_INVOICE_STATUSES.includes(inv.status)));
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setInvoiceOptions([]);
        setInvoicesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setInvoicesLoading(false);
      });
    return () => controller.abort();
  }, [needsInvoicePicker, depositCustomerId, showAllInvoices, tenant]);

  const handleCreateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(async (message) => {
      showToast.success(message);
      setShowCreateModal(false);
      await fetchDeposits();
    });
  };

  const runAction = async (action: DepositAction, run: () => Promise<void>) => {
    setActionError(null);
    setActionBusy(action);
    await run();
    setActionBusy(null);
  };

  const onActionSuccess = (message: string) => {
    showToast.success(message);
    setShowModal(false);
  };

  const handleAction = (action: DepositAction) => {
    const d = selectedDeposit;
    if (!d) return;

    if (action === 'cancel') {
      if (!confirm(fill(dict?.admin?.cancelDepositConfirm || 'Cancel the {amount} deposit from {customer}? This cannot be undone.', d))) return;
      void runAction(action, () => cancelDeposit(d.id, onActionSuccess, setActionError));
      return;
    }

    if (action === 'paid') {
      if (!confirm(fill(dict?.admin?.markPaidConfirm || 'Mark the {amount} deposit from {customer} as paid?', d))) return;
      void runAction(action, () => updateDeposit(d.id, { status: 'paid' }, onActionSuccess, setActionError));
      return;
    }

    if (action === 'applied') {
      const invoiceId = invoiceIdInput.trim();
      if (!invoiceId && !d.invoiceId) {
        setActionError(dict?.admin?.depositInvoiceRequired || 'Enter an invoice ID to apply this deposit');
        return;
      }
      void runAction(action, () =>
        updateDeposit(d.id, { status: 'applied', invoiceId: invoiceId || undefined }, onActionSuccess, setActionError)
      );
      return;
    }

    if (action === 'refunded') {
      const total = Number(d.amount);
      const refund = refundAmountInput.trim() ? Number(refundAmountInput) : total;
      if (!Number.isFinite(refund) || refund <= 0 || refund > total) {
        setActionError(
          (dict?.admin?.refundAmountInvalid || 'Refund amount must be more than 0 and no more than {amount}.').replace('{amount}', money(total))
        );
        return;
      }
      if (!confirm(fill(dict?.admin?.refundConfirm || 'Refund {amount} to {customer}? This cannot be undone.', d, money(refund)))) return;
      void runAction(action, () =>
        updateDeposit(d.id, { status: 'refunded', refundedAmount: refund }, onActionSuccess, setActionError)
      );
      return;
    }

    if (action === 'forfeited') {
      if (!confirm(fill(dict?.admin?.forfeitConfirm || 'Forfeit the {amount} deposit from {customer}? The customer will not be refunded. This cannot be undone.', d))) return;
      void runAction(action, () => updateDeposit(d.id, { status: 'forfeited' }, onActionSuccess, setActionError));
    }
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const closeLabel = dict.common?.close || 'Close';
  const working = dict.admin?.depositWorking || 'Working…';
  const statusLabel = (s: DepositStatus) => getDepositStatusLabel(s, dict);

  const renderBody = () => {
    if (loading && deposits.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingDeposits || 'Loading deposits…'}</p>
        </div>
      );
    }

    if (listError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{dict.admin?.failedToLoadDeposits || 'Failed to load deposits'}</p>
          <p className="text-xs text-gray-500 mt-1">{listError}</p>
          <button
            type="button"
            onClick={() => fetchDeposits()}
            disabled={loading}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (deposits.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {filterStatus !== 'all'
            ? (dict.admin?.noDepositsMatch || 'No deposits match this status.')
            : (dict.admin?.noDepositsYet || 'No deposits yet.')}
        </div>
      );
    }

    const viewLabel = dict.admin?.viewDeposit || 'View deposit';

    return (
      <div className="relative border border-gray-300 bg-white" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20" aria-live="polite">{SPINNER}</div>
        )}
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.linkedTo || 'Linked To'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.customer || 'Customer'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.amount || 'Amount'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deposits.map((deposit) => {
                const linked = linkedLabel(deposit);
                const name = customerName(deposit);
                return (
                  <tr key={deposit.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{linked || '—'}</p>
                      <p className="text-xs text-gray-500 tabular-nums">{fmtDate(deposit.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <p className="font-semibold text-gray-900 tabular-nums"><Currency amount={Number(deposit.amount)} /></p>
                      <p className="text-xs text-gray-500">{dict.admin?.[deposit.method === 'on_account' ? 'onAccount' : deposit.method] || deposit.method}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${getDepositStatusColor(deposit.status)}`}>
                        {statusLabel(deposit.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openDetail(deposit)}
                          title={viewLabel}
                          aria-label={`${viewLabel}: ${[linked, name].filter(Boolean).join(' — ') || money(deposit.amount)}`}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
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
      </div>
    );
  };

  const renderActions = (d: Deposit) => {
    const next = getAllowedNextDepositStatuses(d.status).filter((s) => s !== d.status);
    if (next.length === 0) {
      return (
        <p className="text-sm text-gray-500">
          {(dict.admin?.depositNoActions || 'This deposit is {status} — no further changes are possible.').replace('{status}', statusLabel(d.status).toLowerCase())}
        </p>
      );
    }
    if (!canEdit && !canRefund) return null;

    const busy = actionBusy !== null;
    const label = (action: DepositAction, idle: string) => (actionBusy === action ? working : idle);

    if (d.status === 'pending') {
      if (!canEdit) return null;
      return (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => handleAction('paid')} className={`${ACTION_BUTTON} bg-win8-success`}>
            {label('paid', dict.admin?.markAsPaid || 'Mark as Paid')}
          </button>
          <button type="button" disabled={busy} onClick={() => handleAction('cancel')} className={`${ACTION_BUTTON} bg-win8-danger`}>
            {label('cancel', dict.admin?.cancelDeposit || 'Cancel Deposit')}
          </button>
        </div>
      );
    }

    // paid → applied / refunded / forfeited
    return (
      <div className="space-y-5">
        {canEdit && (<div>
          <label htmlFor="deposit-invoice-id" className={LABEL}>{dict.admin?.depositInvoice || 'Invoice'}</label>
          <div className="flex gap-2">
            <select
              id="deposit-invoice-id"
              value={invoiceIdInput}
              onChange={(e) => setInvoiceIdInput(e.target.value)}
              disabled={invoicesLoading}
              className={`${INPUT} disabled:bg-gray-100`}
            >
              <option value="">
                {invoicesLoading
                  ? (dict.admin?.depositLoadingInvoices || 'Loading invoices…')
                  : (dict.admin?.depositSelectInvoice || 'Select an invoice…')}
              </option>
              {/* Keep an already-linked invoice selectable even if it is no longer open. */}
              {d.invoice && !invoiceOptions.some((inv) => inv.id === d.invoice?.id) && (
                <option value={d.invoice.id}>{d.invoice.invoiceNumber} — {money(d.invoice.total)}</option>
              )}
              {invoiceOptions.map((inv) => {
                const who = inv.customer ? `${inv.customer.firstName} ${inv.customer.lastName}`.trim() : '';
                return (
                  <option key={inv.id} value={inv.id}>
                    {[inv.invoiceNumber, who, money(inv.total)].filter(Boolean).join(' — ')} · {getInvoiceStatusLabel(inv.status as InvoiceStatus, dict)}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              disabled={busy || !invoiceIdInput}
              onClick={() => handleAction('applied')}
              className={`${ACTION_BUTTON} bg-brand shrink-0 whitespace-nowrap`}
            >
              {label('applied', dict.admin?.applyToInvoice || 'Apply to Invoice')}
            </button>
          </div>
          {invoicesError ? (
            <p className="text-xs text-win8-danger mt-1">{dict.admin?.depositInvoicesLoadFailed || 'Could not load invoices.'}</p>
          ) : !invoicesLoading && invoiceOptions.length === 0 ? (
            <p className="text-xs text-gray-500 mt-1">
              {depositCustomerId && !showAllInvoices
                ? (dict.admin?.depositNoOpenInvoices || 'This customer has no open invoices.')
                : (dict.admin?.depositNoOpenInvoicesAll || 'There are no open invoices.')}
            </p>
          ) : null}
          {depositCustomerId && (
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={showAllInvoices}
                onChange={(e) => setShowAllInvoices(e.target.checked)}
              />
              {dict.admin?.depositShowAllCustomers || 'Show invoices for all customers'}
            </label>
          )}
        </div>)}

        {canRefund && (
          <>
            <div>
              <label htmlFor="deposit-refund-amount" className={LABEL}>{dict.admin?.refundAmount || 'Refund amount'}</label>
              <div className="flex gap-2">
                <input
                  id="deposit-refund-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(d.amount)}
                  value={refundAmountInput}
                  onChange={(e) => setRefundAmountInput(e.target.value)}
                  placeholder={Number(d.amount).toFixed(2)}
                  className={`${INPUT} tabular-nums`}
                />
                <button type="button" disabled={busy} onClick={() => handleAction('refunded')} className={`${ACTION_BUTTON} bg-win8-suspended shrink-0`}>
                  {label('refunded', dict.admin?.refundDeposit || 'Refund')}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {(dict.admin?.refundAmountHint || 'Leave empty to refund the full {amount}.').replace('{amount}', money(d.amount))}
              </p>
            </div>

            <div className="p-3 bg-white border border-win8-danger text-sm text-gray-700 space-y-3">
              <p>{dict.admin?.forfeitWarning || 'Forfeiting keeps the full deposit (for example after a no-show). The customer is not refunded and the deposit can no longer be applied or refunded.'}</p>
              <button type="button" disabled={busy} onClick={() => handleAction('forfeited')} className={`${ACTION_BUTTON} bg-win8-danger`}>
                {label('forfeited', dict.admin?.forfeitDeposit || 'Forfeit')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const d = selectedDeposit;
  const actions = d ? renderActions(d) : null;

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.deposits || 'Deposits'}
          description={dict.admin?.depositsSubtitle || 'Upfront payments collected against bookings and work orders'}
        />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label={dict.admin?.filterByStatus || 'Filter by Status'}
              className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
            >
              <option value="all">{dict.admin?.allStatuses || 'All Statuses'}</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors whitespace-nowrap"
              >
                + {dict.admin?.newDeposit || 'New Deposit'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      {/* Detail + status actions */}
      <Win8Drawer open={showModal && !!d} onClose={closeDetail}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{dict.admin?.depositDetails || 'Deposit Details'}</h2>
          <button type="button" onClick={closeDetail} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {d && (
          <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-3xl font-bold text-gray-900 tabular-nums"><Currency amount={Number(d.amount)} /></p>
                <p className="text-sm text-gray-500 mt-0.5">{linkedLabel(d) || '—'}</p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold ${getDepositStatusColor(d.status)}`}>{statusLabel(d.status)}</span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm border-t border-gray-200 pt-4">
              {[
                { label: dict.admin?.customer || 'Customer', value: customerName(d) || '—' },
                { label: dict.admin?.depositMethod || 'Method', value: dict.admin?.[d.method === 'on_account' ? 'onAccount' : d.method] || d.method },
                { label: dict.admin?.depositCreated || 'Created', value: fmtDate(d.createdAt) },
                { label: dict.admin?.depositRecordedBy || 'Recorded by', value: d.recordedBy?.name || '—' },
                ...(d.paidAt ? [{ label: dict.admin?.depositPaidAt || 'Paid', value: fmtDate(d.paidAt) }] : []),
                ...(d.appliedAt ? [{ label: dict.admin?.depositAppliedAt || 'Applied', value: fmtDate(d.appliedAt) }] : []),
                ...(d.invoice ? [{ label: dict.admin?.depositInvoice || 'Invoice', value: d.invoice.invoiceNumber }] : []),
                ...(d.refundedAt ? [{ label: dict.admin?.depositRefundedAt || 'Refunded', value: fmtDate(d.refundedAt) }] : []),
                ...(d.refundedAmount != null ? [{ label: dict.admin?.depositRefundedAmount || 'Refunded amount', value: money(d.refundedAmount) }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-gray-900 tabular-nums break-words">{value}</dd>
                </div>
              ))}
            </dl>

            {d.notes && (
              <div>
                <p className="text-xs text-gray-500">{dict.admin?.notes || 'Notes'}</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{d.notes}</p>
              </div>
            )}

            {actions && (
              <>
                <hr className="border-gray-300" />
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{dict.admin?.depositActions || 'Actions'}</p>
                  {actions}
                  {actionError && <div className="mt-4 bg-win8-danger text-white text-sm p-3">{actionError}</div>}
                </div>
              </>
            )}
          </div>
        )}
      </Win8Drawer>

      {/* Record deposit */}
      <Win8Drawer open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
          <h2 className="text-base font-semibold">{dict.admin?.recordNewDeposit || 'Record Deposit'}</h2>
          <button type="button" onClick={() => setShowCreateModal(false)} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleCreateDeposit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label htmlFor="deposit-booking" className={LABEL}>{dict.admin?.booking || 'Booking'}</label>
              <select
                id="deposit-booking"
                value={formData.bookingId}
                onChange={(e) => setFormData({ ...formData, bookingId: e.target.value, workOrderId: e.target.value ? '' : formData.workOrderId })}
                className={INPUT}
              >
                <option value="">{dict.admin?.none || 'None'}</option>
                {bookingOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.serviceName} — {b.customerName} ({new Date(b.startTime).toLocaleDateString(lang === 'es' ? 'es' : 'en')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="deposit-work-order" className={LABEL}>{dict.admin?.workOrder || 'Work Order'}</label>
              <select
                id="deposit-work-order"
                value={formData.workOrderId}
                onChange={(e) => setFormData({ ...formData, workOrderId: e.target.value, bookingId: e.target.value ? '' : formData.bookingId })}
                className={INPUT}
              >
                <option value="">{dict.admin?.none || 'None'}</option>
                {workOrders.map((w) => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {dict.admin?.depositTargetHint || 'Pick a booking or a work order — a deposit must be linked to one of them.'}
              </p>
            </div>
            <hr className="border-gray-300" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="deposit-amount" className={LABEL}>
                  {dict.admin?.amount || 'Amount'} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="deposit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className={`${INPUT} tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="deposit-method" className={LABEL}>{dict.admin?.paymentMethod || 'Payment Method'}</label>
                <select
                  id="deposit-method"
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value as typeof formData.method })}
                  className={INPUT}
                >
                  <option value="cash">{dict.admin?.cash || 'Cash'}</option>
                  <option value="card">{dict.admin?.card || 'Card'}</option>
                  <option value="digital">{dict.admin?.digital || 'Digital'}</option>
                  <option value="check">{dict.admin?.check || 'Check'}</option>
                  <option value="on_account">{dict.admin?.onAccount || 'On Account'}</option>
                  <option value="other">{dict.admin?.other || 'Other'}</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={formData.markPaid}
                onChange={(e) => setFormData({ ...formData, markPaid: e.target.checked })}
              />
              {dict.admin?.markPaidNow || 'Payment already received — mark as paid now'}
            </label>
            <div>
              <label htmlFor="deposit-notes" className={LABEL}>
                {dict.admin?.notes || 'Notes'} <span className="text-gray-400 font-normal">({dict.common?.optional || 'optional'})</span>
              </label>
              <textarea
                id="deposit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>
            {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
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
              disabled={submitting || (!formData.bookingId && !formData.workOrderId)}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (dict.admin?.recordingDeposit || 'Recording…') : (dict.admin?.recordDeposit || 'Record Deposit')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}
