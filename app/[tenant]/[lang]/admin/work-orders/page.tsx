'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import Currency from '@/components/Currency';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature, getBusinessType } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { useWorkOrderList, type WorkOrder } from '@/hooks/useWorkOrderList';
import { useWorkOrderForm } from '@/hooks/useWorkOrderForm';
import { useTechnicianList } from '@/hooks/useTechnicianList';
import { useWorkOrderTimeEntries } from '@/hooks/useWorkOrderTimeEntries';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import {
  WORK_ORDER_STATUSES,
  getStatusColor,
  getStatusLabel,
  formatWorkOrderDateTime,
  getDeleteWorkOrderConfirmMessage,
  getAllowedNextStatuses,
  isWorkOrderStatusEditable,
  type WorkOrderStatus,
} from '@/lib/work-order-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function WorkOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canCreate = canAccess('work_orders.create');
  const canEdit = canAccess('work_orders.edit');
  // Cancelling an order is DELETE on the order.
  const canDelete = canAccess('work_orders.delete');
  const canTrackTime = canAccess('work_order_time.manage');
  const { user } = useAuth();

  const { settings } = useTenantSettings();
  const workOrdersEnabled = supportsFeature(settings ?? undefined, 'workOrders');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { workOrders, loading, error, fetchWorkOrders, updateWorkOrder, cancelWorkOrder } = useWorkOrderList(tenant, {
    status: filterStatus,
    assignedToId: filterAssignee,
  });
  const {
    formData,
    setFormData,
    submitting,
    error: formError,
    handleSubmit: submitForm,
    resetForm,
    addItem,
    removeItem,
    updateItem,
  } = useWorkOrderForm(tenant);
  const { technicians, fetchTechnicians } = useTechnicianList(tenant);
  const { timeEntries, fetchTimeEntries, startTimeEntry, stopTimeEntry } = useWorkOrderTimeEntries(tenant, selectedOrder?.id || '');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchWorkOrders((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterAssignee]);

  useEffect(() => {
    fetchTechnicians((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showDetail && selectedOrder?.id && canTrackTime) {
      fetchTimeEntries((err) => showToast.error(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetail, selectedOrder?.id]);

  const closeCreate = () => {
    setShowCreate(false);
    resetForm();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(async (message) => {
      showToast.success(message || dict?.common?.workOrderCreatedSuccess || 'Work order created successfully');
      await fetchWorkOrders();
      closeCreate();
    });
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const hasFilters = filterStatus !== 'all' || filterAssignee !== 'all';

  const renderBody = () => {
    if (loading && workOrders.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingWorkOrders || 'Loading work orders…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchWorkOrders()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (workOrders.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noWorkOrdersMatch || 'No work orders match your filters.')
            : (dict.admin?.noWorkOrdersYet || 'No work orders yet.')}
        </div>
      );
    }

    const viewLabel = dict.common?.view || 'View';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.title || 'Title'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.technician || 'Technician'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{order.title}</p>
                  <p className="text-xs text-gray-500">{formatWorkOrderDateTime(order.createdAt)}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {order.assignedTo?.name || <span className="text-gray-400">{dict.admin?.unassigned || 'Unassigned'}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status, dict)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setSelectedOrder(order); setShowDetail(true); }}
                      title={viewLabel}
                      aria-label={`${viewLabel}: ${order.title}`}
                      className={`${ICON_BUTTON} bg-brand`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const myOpenEntry = timeEntries.find((e) => e.userId === user?._id && !e.endedAt);

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.workOrders || 'Job / Work Orders'}
          description={dict.admin?.workOrdersSubtitle || 'Manage jobs, technician assignments, and parts/labor'}
        />

        <div className="space-y-4">
          {!workOrdersEnabled && (
            <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
              <p className="font-semibold">{dict.admin?.workOrdersNotAvailableTitle || 'Job / Work Orders Not Available'}</p>
              <p className="mt-1">
                {(dict.admin?.workOrdersNotAvailableDesc || 'Job / Work Orders is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || (dict.admin?.yourBusinessType || 'your business type'))}
              </p>
              <p className="mt-1">
                {dict.admin?.workOrdersNotAvailableHint || 'Enable Work Orders under Settings → Business, or choose a business type that supports it.'}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
            <div className="flex gap-3 flex-wrap">
              <select
                aria-label={dict.admin?.filterByStatus || 'Filter by status'}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="all">{dict.admin?.allStatuses || 'All Statuses'}</option>
                {WORK_ORDER_STATUSES.map(({ value: s }) => (
                  <option key={s} value={s}>{getStatusLabel(s as WorkOrderStatus, dict)}</option>
                ))}
              </select>
              <select
                aria-label={dict.admin?.filterByTechnician || 'Filter by technician'}
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="all">{dict.admin?.allTechnicians || 'All Technicians'}</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setFilterStatus('all'); setFilterAssignee('all'); }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {dict.common?.clearFilters || 'Clear Filters'}
                </button>
              )}
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={!workOrdersEnabled}
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                + {dict.admin?.newWorkOrder || 'New Work Order'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showDetail} onClose={() => setShowDetail(false)} widthClass="max-w-2xl">
        {selectedOrder && (
          <WorkOrderDetail
            key={selectedOrder.id}
            order={selectedOrder}
            technicians={technicians}
            dict={dict}
            canEdit={canEdit}
            canDelete={canDelete}
            onClose={() => setShowDetail(false)}
            onUpdate={(updates) =>
              new Promise<void>((resolve) => {
                updateWorkOrder(
                  selectedOrder.id,
                  updates,
                  (message) => { showToast.success(message); setShowDetail(false); resolve(); },
                  (err) => { showToast.error(err); resolve(); }
                );
              })
            }
            onCancelOrder={() =>
              new Promise<void>((resolve) => {
                if (!confirm(getDeleteWorkOrderConfirmMessage(dict))) return resolve();
                cancelWorkOrder(
                  selectedOrder.id,
                  (message) => { showToast.success(message); setShowDetail(false); resolve(); },
                  (err) => { showToast.error(err); resolve(); }
                );
              })
            }
            timeTracking={canTrackTime ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict.admin?.timeTracking || 'Time Tracking'}</p>
                  {myOpenEntry ? (
                    <button
                      type="button"
                      onClick={() => stopTimeEntry(myOpenEntry.id, () => showToast.success(dict.admin?.timerStopped || 'Timer stopped'), (err) => showToast.error(err))}
                      className="inline-flex items-center justify-center px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 transition-[filter]"
                    >
                      {dict.admin?.stopTimer || 'Stop Timer'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startTimeEntry(() => showToast.success(dict.admin?.timerStarted || 'Timer started'), (err) => showToast.error(err))}
                      className="inline-flex items-center justify-center px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
                    >
                      {dict.admin?.startTimer || 'Start Timer'}
                    </button>
                  )}
                </div>
                {timeEntries.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">{dict.admin?.noTimeEntriesYet || 'No time logged yet.'}</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-gray-200 border-y border-gray-200">
                      {timeEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-2 text-gray-900">
                            {entry.user?.name || '—'}
                            <span className="block text-xs text-gray-400">{formatWorkOrderDateTime(entry.startedAt)}</span>
                          </td>
                          <td className="py-2 text-right text-gray-700 tabular-nums">
                            {entry.endedAt
                              ? `${entry.durationMinutes ?? 0} ${dict.admin?.minutesShort || 'min'}`
                              : <span className="px-2 py-0.5 text-xs font-semibold bg-win8-success text-white">{dict.admin?.timerRunning || 'Running…'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          />
        )}
      </Win8Drawer>

      <Win8Drawer open={showCreate} onClose={closeCreate} widthClass="max-w-2xl">
        <DrawerHeader title={dict.admin?.createNewWorkOrder || 'Create Work Order'} onClose={closeCreate} dict={dict} />
        <form onSubmit={handleCreateOrder} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div>
              <label htmlFor="wo-title" className={LABEL}>{dict.admin?.title || 'Title'} <span className="text-win8-danger">*</span></label>
              <input
                id="wo-title"
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="wo-description" className={LABEL}>{dict.admin?.description || 'Description'}</label>
              <textarea
                id="wo-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className={`${INPUT} resize-none`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="wo-technician" className={LABEL}>{dict.admin?.technician || 'Technician'}</label>
                <select
                  id="wo-technician"
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  className={INPUT}
                >
                  <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wo-scheduled" className={LABEL}>{dict.admin?.scheduledAt || 'Scheduled For'}</label>
                <input
                  id="wo-scheduled"
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict.admin?.lineItems || 'Parts / Labor'}</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict.admin?.addLineItem || '+ Add line'}
                </button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center border border-gray-300 p-2">
                    <select
                      aria-label={dict.admin?.type || 'Type'}
                      value={item.itemType}
                      onChange={(e) => updateItem(index, { itemType: e.target.value as 'part' | 'labor' })}
                      className="col-span-4 sm:col-span-2 border border-gray-300 px-2 py-2 text-sm bg-white"
                    >
                      <option value="part">{dict.admin?.part || 'Part'}</option>
                      <option value="labor">{dict.admin?.labor || 'Labor'}</option>
                    </select>
                    <input
                      type="text"
                      aria-label={dict.admin?.name || 'Name'}
                      placeholder={dict.admin?.name || 'Name'}
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      className="col-span-8 sm:col-span-4 border border-gray-300 px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={dict.admin?.price || 'Price'}
                      placeholder={dict.admin?.price || 'Price'}
                      value={item.price}
                      onChange={(e) => updateItem(index, { price: e.target.value })}
                      className="col-span-5 sm:col-span-3 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                    />
                    <input
                      type="number"
                      min="1"
                      aria-label={dict.admin?.quantity || 'Qty'}
                      placeholder={dict.admin?.quantity || 'Qty'}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      className="col-span-4 sm:col-span-2 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      title={dict.common?.remove || 'Remove'}
                      aria-label={dict.common?.remove || 'Remove'}
                      className={`col-span-3 sm:col-span-1 ${ICON_BUTTON} bg-win8-danger`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {formData.items.length === 0 && (
                  <p className="text-sm text-gray-400 italic">{dict.admin?.noLineItemsYet || 'No parts/labor lines added yet.'}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="wo-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
              <textarea
                id="wo-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className={`${INPUT} resize-none`}
              />
            </div>
            <hr className="border-gray-300" />
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox-win8"
                checked={formData.collectDeposit}
                onChange={(e) => setFormData({ ...formData, collectDeposit: e.target.checked })}
              />
              {dict.admin?.collectDepositNow || 'Collect a deposit now'}
            </label>
            {formData.collectDeposit && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wo-deposit" className={LABEL}>{dict.admin?.depositAmount || 'Deposit Amount'} <span className="text-win8-danger">*</span></label>
                  <input
                    id="wo-deposit"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.depositAmount}
                    onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                    className={`${INPUT} tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="wo-deposit-method" className={LABEL}>{dict.admin?.paymentMethod || 'Payment Method'}</label>
                  <select
                    id="wo-deposit-method"
                    value={formData.depositMethod}
                    onChange={(e) => setFormData({ ...formData, depositMethod: e.target.value as typeof formData.depositMethod })}
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
            )}
            {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
            <button
              type="button"
              onClick={closeCreate}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.createWorkOrder || 'Create Work Order')}
            </button>
          </div>
        </form>
      </Win8Drawer>
    </>
  );
}

function DrawerHeader({ title, onClose, dict }: { title: string; onClose: () => void; dict: TranslationDict }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
      <h2 className="text-base font-semibold">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        title={dict.common?.close || 'Close'}
        aria-label={dict.common?.close || 'Close'}
        className="text-white/70 hover:text-white"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function WorkOrderDetail({
  order,
  technicians,
  dict,
  canEdit,
  canDelete,
  onClose,
  onUpdate,
  onCancelOrder,
  timeTracking,
}: {
  order: WorkOrder;
  technicians: { id: string; name: string }[];
  dict: TranslationDict;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Pick<WorkOrder, 'status' | 'assignedToId'>>) => Promise<void>;
  onCancelOrder: () => Promise<void>;
  timeTracking: React.ReactNode;
}) {
  const [assignedToId, setAssignedToId] = useState(order.assignedToId || '');
  const [status, setStatus] = useState<WorkOrderStatus>(order.status);
  const [busy, setBusy] = useState(false);

  const statusEditable = canEdit && isWorkOrderStatusEditable(order.status);
  const canCancel = canDelete && getAllowedNextStatuses(order.status).includes('cancelled') && order.status !== 'cancelled';
  const dirty = assignedToId !== (order.assignedToId || '') || status !== order.status;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updates: Partial<Pick<WorkOrder, 'status' | 'assignedToId'>> = {};
    // null (not undefined) so the field survives JSON.stringify and the API clears the technician.
    if (assignedToId !== (order.assignedToId || '')) updates.assignedToId = assignedToId || null;
    if (status !== order.status) updates.status = status;
    setBusy(true);
    await onUpdate(updates);
    setBusy(false);
  };

  const cancelOrder = async () => {
    setBusy(true);
    await onCancelOrder();
    setBusy(false);
  };

  return (
    <>
      <DrawerHeader title={dict.admin?.workOrderDetails || 'Work Order Details'} onClose={onClose} dict={dict} />
      <form onSubmit={save} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <p className="text-base font-semibold text-gray-900">{order.title}</p>
            {order.description && <p className="mt-1 text-sm text-gray-500 whitespace-pre-wrap">{order.description}</p>}
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(order.status)}`}>{getStatusLabel(order.status, dict)}</span>
              <span className="text-xs text-gray-400">{formatWorkOrderDateTime(order.createdAt)}</span>
            </div>
          </div>
          {order.customer && (
            <div>
              <p className={LABEL}>{dict.admin?.customer || 'Customer'}</p>
              <p className="text-sm text-gray-900">{order.customer.firstName} {order.customer.lastName}</p>
              {order.customer.phone && <p className="text-xs text-gray-500">{order.customer.phone}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wo-detail-tech" className={LABEL}>{dict.admin?.technician || 'Technician'}</label>
              <select
                id="wo-detail-tech"
                value={assignedToId}
                disabled={!canEdit}
                onChange={(e) => setAssignedToId(e.target.value)}
                className={`${INPUT} disabled:bg-gray-100`}
              >
                <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wo-detail-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
              <select
                id="wo-detail-status"
                value={status}
                disabled={!statusEditable}
                onChange={(e) => setStatus(e.target.value as WorkOrderStatus)}
                className={`${INPUT} disabled:bg-gray-100`}
              >
                {getAllowedNextStatuses(order.status)
                  // Cancelling goes through the dedicated button so it gets a confirm.
                  .filter((s) => s !== 'cancelled' || order.status === 'cancelled')
                  .map((s) => (
                    <option key={s} value={s}>{getStatusLabel(s as WorkOrderStatus, dict)}</option>
                  ))}
              </select>
            </div>
          </div>
          {order.items && order.items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dict.admin?.lineItems || 'Parts / Labor'}</p>
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-200 border-y border-gray-200">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 text-gray-900">
                        {item.name}
                        <span className="ml-1 text-xs text-gray-400">
                          ({item.itemType === 'labor' ? (dict.admin?.labor || 'Labor') : (dict.admin?.part || 'Part')})
                        </span>
                      </td>
                      <td className="py-2 text-right text-xs text-gray-500 tabular-nums">
                        {item.quantity} × <Currency amount={Number(item.price)} />
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900">
                        <Currency amount={Number(item.subtotal)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {order.notes && (
            <div>
              <p className={LABEL}>{dict.admin?.notes || 'Notes'}</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
          {timeTracking && (
            <>
              <hr className="border-gray-300" />
              {timeTracking}
            </>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 shrink-0">
          {canCancel && (
            <button
              type="button"
              onClick={cancelOrder}
              disabled={busy}
              className="px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
            >
              {dict.common?.cancelWorkOrder || 'Cancel Work Order'}
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
            >
              {dict.common?.close || 'Close'}
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={busy || !dirty}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                {busy ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
