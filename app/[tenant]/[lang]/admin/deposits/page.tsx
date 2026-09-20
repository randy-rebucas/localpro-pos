'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useDepositList, type Deposit } from '@/hooks/useDepositList';
import { useDepositForm } from '@/hooks/useDepositForm';
import { useWorkOrderList } from '@/hooks/useWorkOrderList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getDepositStatusColor,
  getAllowedNextDepositStatuses,
  isDepositStatusEditable,
  type DepositStatus,
} from '@/lib/deposit-helpers';

interface BookingOption {
  id: string;
  serviceName: string;
  customerName: string;
  startTime: string;
}

export default function DepositsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [bookingOptions, setBookingOptions] = useState<BookingOption[]>([]);
  const [invoiceIdInput, setInvoiceIdInput] = useState('');
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const { canAccess } = usePermissions();
  const canManage = canAccess('deposits.manage');
  const canRefund = canAccess('deposits.refund');

  const { deposits, loading, fetchDeposits, updateDeposit, cancelDeposit } = useDepositList(tenant, {
    status: filterStatus,
  });
  const { formData, setFormData, handleSubmit: submitForm, resetForm } = useDepositForm(tenant);
  const { workOrders, fetchWorkOrders } = useWorkOrderList(tenant, { status: 'all', assignedToId: 'all' });

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchDeposits((error) => toast.error(error));
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

  const handleCreateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async (message) => {
        toast.success(message);
        await fetchDeposits();
        setShowCreateModal(false);
        resetForm();
      },
      (error) => toast.error(error)
    );
  };

  const handleUpdateDeposit = async (id: string, updates: Partial<Pick<Deposit, 'status' | 'invoiceId' | 'notes' | 'refundedAmount'>>) => {
    await updateDeposit(id, updates, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedDeposit(null);
    }, (error) => toast.error(error));
  };

  const handleCancelDeposit = async (id: string) => {
    if (!confirm(dict?.common?.cancelDepositConfirm || 'Are you sure you want to cancel this deposit?')) return;
    await cancelDeposit(id, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedDeposit(null);
    }, (error) => toast.error(error));
  };

  const handleStatusChange = (status: DepositStatus) => {
    if (!selectedDeposit) return;
    if (status === 'applied') {
      if (!invoiceIdInput && !selectedDeposit.invoiceId) {
        toast.error(dict?.admin?.depositInvoiceRequired || 'Enter an invoice ID to apply this deposit');
        return;
      }
      handleUpdateDeposit(selectedDeposit.id, { status, invoiceId: invoiceIdInput || undefined });
      return;
    }
    if (status === 'refunded') {
      handleUpdateDeposit(selectedDeposit.id, {
        status,
        refundedAmount: refundAmountInput ? Number(refundAmountInput) : selectedDeposit.amount,
      });
      return;
    }
    handleUpdateDeposit(selectedDeposit.id, { status });
  };

  if (loading && deposits.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingDeposits || 'Loading deposits...'}</p>
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
              {dict?.admin?.deposits || 'Deposits'}
            </h1>
            <p className="text-sm text-gray-500">{dict?.admin?.depositsSubtitle || 'Upfront payments collected against bookings and work orders'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-2 border border-brand-hover"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {dict?.admin?.newDeposit || 'New Deposit'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
          >
            <option value="all">{dict?.admin?.allStatuses || 'All Statuses'}</option>
            <option value="pending">{dict?.admin?.pending || 'Pending'}</option>
            <option value="paid">{dict?.admin?.paid || 'Paid'}</option>
            <option value="applied">{dict?.admin?.applied || 'Applied'}</option>
            <option value="refunded">{dict?.admin?.refunded || 'Refunded'}</option>
            <option value="forfeited">{dict?.admin?.forfeited || 'Forfeited'}</option>
            <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
          </select>
        </div>

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{dict?.admin?.allDeposits || 'All Deposits'}</h2>
            <span className="text-xs text-gray-400">{deposits.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.linkedTo || 'Linked To'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.customer || 'Customer'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.amount || 'Amount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deposits.map((deposit) => (
                  <tr key={deposit.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">
                        {deposit.booking?.serviceName || deposit.workOrder?.title || '—'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(deposit.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {deposit.customer ? `${deposit.customer.firstName} ${deposit.customer.lastName}` : deposit.booking?.customerName || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{deposit.amount}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getDepositStatusColor(deposit.status)}`}>
                        {dict?.admin?.[deposit.status] || deposit.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedDeposit(deposit);
                          setInvoiceIdInput(deposit.invoiceId || '');
                          setRefundAmountInput('');
                          setShowModal(true);
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
            {deposits.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noDepositsFound || 'No deposits found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Status Modal */}
      {showModal && selectedDeposit && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.depositDetails || 'Deposit Details'}</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedDeposit(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.linkedTo || 'Linked To'}</label>
                <p className="mt-1 text-sm text-gray-900">
                  {selectedDeposit.booking?.serviceName || selectedDeposit.workOrder?.title || '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.amount || 'Amount'}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedDeposit.amount} ({selectedDeposit.method})</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedDeposit.status}
                  disabled={!canManage || !isDepositStatusEditable(selectedDeposit.status)}
                  onChange={(e) => handleStatusChange(e.target.value as DepositStatus)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAllowedNextDepositStatuses(selectedDeposit.status)
                    .filter((s) => !['refunded', 'forfeited'].includes(s) || canRefund || s === selectedDeposit.status)
                    .map((s) => (
                      <option key={s} value={s}>{dict?.admin?.[s] || s}</option>
                    ))}
                </select>
              </div>
              {selectedDeposit.status === 'paid' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{dict?.admin?.applyToInvoiceId || 'Invoice ID (to apply)'}</label>
                    <input
                      type="text"
                      value={invoiceIdInput}
                      onChange={(e) => setInvoiceIdInput(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                    />
                  </div>
                  {canRefund && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{dict?.admin?.refundAmount || 'Refund Amount (optional, defaults to full)'}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={refundAmountInput}
                        onChange={(e) => setRefundAmountInput(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                      />
                    </div>
                  )}
                </>
              )}
              {selectedDeposit.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedDeposit.notes}</p>
                </div>
              )}
              {canManage && selectedDeposit.status === 'pending' && (
                <div className="flex gap-2 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleCancelDeposit(selectedDeposit.id)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                  >
                    {dict?.common?.cancelDeposit || 'Cancel Deposit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Deposit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.recordNewDeposit || 'Record Deposit'}</h3>
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
            <form onSubmit={handleCreateDeposit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.booking || 'Booking'}</label>
                <select
                  value={formData.bookingId}
                  onChange={(e) => setFormData({ ...formData, bookingId: e.target.value, workOrderId: e.target.value ? '' : formData.workOrderId })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="">{dict?.admin?.none || 'None'}</option>
                  {bookingOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.serviceName} — {b.customerName} ({new Date(b.startTime).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.workOrder || 'Work Order'}</label>
                <select
                  value={formData.workOrderId}
                  onChange={(e) => setFormData({ ...formData, workOrderId: e.target.value, bookingId: e.target.value ? '' : formData.bookingId })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="">{dict?.admin?.none || 'None'}</option>
                  {workOrders.map((w) => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-400">{dict?.admin?.depositTargetHint || 'Pick a booking or a work order — a deposit must be linked to one of them.'}</p>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.amount || 'Amount'} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.paymentMethod || 'Payment Method'}</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value as typeof formData.method })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="cash">{dict?.admin?.cash || 'Cash'}</option>
                  <option value="card">{dict?.admin?.card || 'Card'}</option>
                  <option value="digital">{dict?.admin?.digital || 'Digital'}</option>
                  <option value="check">{dict?.admin?.check || 'Check'}</option>
                  <option value="on_account">{dict?.admin?.onAccount || 'On Account'}</option>
                  <option value="other">{dict?.admin?.other || 'Other'}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="markPaid"
                  type="checkbox"
                  checked={formData.markPaid}
                  onChange={(e) => setFormData({ ...formData, markPaid: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="markPaid" className="text-sm text-gray-700">
                  {dict?.admin?.markPaidNow || 'Payment already received — mark as paid now'}
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>
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
                  disabled={!formData.bookingId && !formData.workOrderId}
                  className="flex-1 px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dict?.admin?.recordDeposit || 'Record Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
