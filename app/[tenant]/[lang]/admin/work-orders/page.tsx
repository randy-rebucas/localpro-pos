'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useWorkOrderList, type WorkOrder } from '@/hooks/useWorkOrderList';
import { useWorkOrderForm } from '@/hooks/useWorkOrderForm';
import { useTechnicianList } from '@/hooks/useTechnicianList';
import { useWorkOrderTimeEntries } from '@/hooks/useWorkOrderTimeEntries';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import {
  getStatusColor,
  formatWorkOrderDateTime,
  getDeleteWorkOrderConfirmMessage,
  getAllowedNextStatuses,
  isWorkOrderStatusEditable,
  type WorkOrderStatus,
} from '@/lib/work-order-helpers';

export default function WorkOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canManage = canAccess('work_orders.manage');
  const canTrackTime = canAccess('work_order_time.manage');
  const { user } = useAuth();

  const { settings } = useTenantSettings();
  const workOrdersEnabled = supportsFeature(settings ?? undefined, 'workOrders');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { workOrders, loading, fetchWorkOrders, updateWorkOrder, cancelWorkOrder } = useWorkOrderList(tenant, {
    status: filterStatus,
    assignedToId: filterAssignee,
  });
  const { formData, setFormData, handleSubmit: submitForm, resetForm, addItem, removeItem, updateItem } = useWorkOrderForm(tenant);
  const { technicians, fetchTechnicians } = useTechnicianList(tenant);
  const { timeEntries, fetchTimeEntries, startTimeEntry, stopTimeEntry } = useWorkOrderTimeEntries(tenant, selectedOrder?.id || '');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchWorkOrders((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterAssignee]);

  useEffect(() => {
    fetchTechnicians((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showModal && selectedOrder?.id) {
      fetchTimeEntries((error) => toast.error(error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, selectedOrder?.id]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async (message) => {
        toast.success(message || dict?.common?.workOrderCreatedSuccess || 'Work order created successfully');
        await fetchWorkOrders();
        setShowCreateModal(false);
        resetForm();
      },
      (error) => toast.error(error)
    );
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Pick<WorkOrder, 'status' | 'assignedToId' | 'notes' | 'cancellationReason'>>) => {
    await updateWorkOrder(id, updates, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  const handleCancelOrder = async (id: string) => {
    if (!confirm(getDeleteWorkOrderConfirmMessage(dict))) return;
    await cancelWorkOrder(id, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  if (loading && workOrders.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingWorkOrders || 'Loading work orders...'}</p>
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
              {dict?.admin?.workOrders || 'Job / Work Orders'}
            </h1>
            <p className="text-sm text-gray-500">{dict?.admin?.workOrdersSubtitle || 'Manage jobs, technician assignments, and parts/labor'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              disabled={!workOrdersEnabled}
              onClick={() => workOrdersEnabled && setShowCreateModal(true)}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-2 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {dict?.admin?.newWorkOrder || 'New Work Order'}
            </button>
          )}
        </div>

        {!workOrdersEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict?.admin?.workOrdersNotAvailableTitle || 'Job / Work Orders Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict?.admin?.workOrdersNotAvailableDesc || 'Job / Work Orders is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict?.admin?.workOrdersNotAvailableHint ||
                    'Enable Work Orders under Settings → Business, or choose a business type that supports it.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
          >
            <option value="all">{dict?.admin?.allStatuses || 'All Statuses'}</option>
            <option value="pending">{dict?.admin?.pending || 'Pending'}</option>
            <option value="assigned">{dict?.admin?.assigned || 'Assigned'}</option>
            <option value="in_progress">{dict?.admin?.inProgress || 'In Progress'}</option>
            <option value="on_hold">{dict?.admin?.onHold || 'On Hold'}</option>
            <option value="completed">{dict?.admin?.completed || 'Completed'}</option>
            <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
          </select>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
          >
            <option value="all">{dict?.admin?.allTechnicians || 'All Technicians'}</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{dict?.admin?.allWorkOrders || 'All Work Orders'}</h2>
            <span className="text-xs text-gray-400">{workOrders.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.title || 'Title'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.technician || 'Technician'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {workOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{order.title}</div>
                      <div className="text-xs text-gray-500">{formatWorkOrderDateTime(order.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{order.assignedTo?.name || dict?.admin?.unassigned || 'Unassigned'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(order.status)}`}>
                        {dict?.admin?.[order.status] || order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
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
            {workOrders.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noWorkOrdersFound || 'No work orders found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Assign Technician Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.workOrderDetails || 'Work Order Details'}</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedOrder(null);
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
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.title || 'Title'}</label>
                <p className="mt-1 text-sm text-gray-900">{selectedOrder.title}</p>
                {selectedOrder.description && (
                  <p className="mt-1 text-sm text-gray-500">{selectedOrder.description}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.technician || 'Technician'}</label>
                <select
                  value={selectedOrder.assignedToId || ''}
                  disabled={!canManage}
                  onChange={(e) => handleUpdateOrder(selectedOrder.id, { assignedToId: e.target.value || undefined })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedOrder.status}
                  disabled={!canManage || !isWorkOrderStatusEditable(selectedOrder.status)}
                  onChange={(e) => handleUpdateOrder(selectedOrder.id, { status: e.target.value as WorkOrderStatus })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAllowedNextStatuses(selectedOrder.status).map((s) => (
                    <option key={s} value={s}>{dict?.admin?.[s] || s}</option>
                  ))}
                </select>
              </div>
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.lineItems || 'Parts / Labor'}</label>
                  <div className="mt-1 border border-gray-200 divide-y divide-gray-200">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-900">{item.name} <span className="text-gray-400 capitalize">({item.itemType})</span></span>
                        <span className="text-gray-500">{item.quantity} x {item.price} = {item.subtotal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedOrder.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedOrder.notes}</p>
                </div>
              )}
              {canTrackTime && (
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">{dict?.admin?.timeTracking || 'Time Tracking'}</label>
                    {(() => {
                      const myOpenEntry = timeEntries.find((e) => e.userId === user?._id && !e.endedAt);
                      if (myOpenEntry) {
                        return (
                          <button
                            type="button"
                            onClick={() => stopTimeEntry(myOpenEntry.id, () => toast.success(dict?.admin?.timerStopped || 'Timer stopped'), (error) => toast.error(error))}
                            className="text-sm px-3 py-1 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                          >
                            {dict?.admin?.stopTimer || 'Stop Timer'}
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => startTimeEntry(() => toast.success(dict?.admin?.timerStarted || 'Timer started'), (error) => toast.error(error))}
                          className="text-sm px-3 py-1 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover"
                        >
                          {dict?.admin?.startTimer || 'Start Timer'}
                        </button>
                      );
                    })()}
                  </div>
                  <div className="mt-2 border border-gray-200 divide-y divide-gray-200">
                    {timeEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-900">
                          {entry.user?.name || 'Unknown'}
                          <span className="text-gray-400"> — {new Date(entry.startedAt).toLocaleString()}</span>
                        </span>
                        <span className="text-gray-500">
                          {entry.endedAt
                            ? `${entry.durationMinutes ?? 0} min`
                            : dict?.admin?.timerRunning || 'Running…'}
                        </span>
                      </div>
                    ))}
                    {timeEntries.length === 0 && (
                      <p className="text-xs text-gray-400 px-3 py-2">{dict?.admin?.noTimeEntriesYet || 'No time logged yet.'}</p>
                    )}
                  </div>
                </div>
              )}
              {canManage && (
                <div className="flex gap-2 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleCancelOrder(selectedOrder.id)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                  >
                    {dict?.common?.cancelWorkOrder || 'Cancel Work Order'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.createNewWorkOrder || 'Create Work Order'}</h3>
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
            <form onSubmit={handleCreateOrder} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.title || 'Title'} *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.description || 'Description'}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.technician || 'Technician'}</label>
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Line items sub-form */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.lineItems || 'Parts / Labor'}</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-sm text-brand hover:text-brand-navy-deep"
                  >
                    {dict?.admin?.addLineItem || '+ Add line'}
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center border border-gray-200 p-2">
                      <select
                        value={item.itemType}
                        onChange={(e) => updateItem(index, { itemType: e.target.value as 'part' | 'labor' })}
                        className="px-2 py-1 border border-gray-300 bg-white text-sm"
                      >
                        <option value="part">{dict?.admin?.part || 'Part'}</option>
                        <option value="labor">{dict?.admin?.labor || 'Labor'}</option>
                      </select>
                      <input
                        type="text"
                        placeholder={dict?.admin?.name || 'Name'}
                        value={item.name}
                        onChange={(e) => updateItem(index, { name: e.target.value })}
                        className="flex-1 px-2 py-1 border border-gray-300 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder={dict?.admin?.price || 'Price'}
                        value={item.price}
                        onChange={(e) => updateItem(index, { price: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-300 text-sm"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder={dict?.admin?.quantity || 'Qty'}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: e.target.value })}
                        className="w-16 px-2 py-1 border border-gray-300 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        {dict?.common?.remove || 'Remove'}
                      </button>
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <p className="text-xs text-gray-400">{dict?.admin?.noLineItemsYet || 'No parts/labor lines added yet.'}</p>
                  )}
                </div>
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
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    id="collectDeposit"
                    type="checkbox"
                    checked={formData.collectDeposit}
                    onChange={(e) => setFormData({ ...formData, collectDeposit: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <label htmlFor="collectDeposit" className="text-sm font-medium text-gray-700">
                    {dict?.admin?.collectDepositNow || 'Collect a deposit now'}
                  </label>
                </div>
                {formData.collectDeposit && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{dict?.admin?.depositAmount || 'Deposit Amount'} *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required={formData.collectDeposit}
                        value={formData.depositAmount}
                        onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">{dict?.admin?.paymentMethod || 'Payment Method'}</label>
                      <select
                        value={formData.depositMethod}
                        onChange={(e) => setFormData({ ...formData, depositMethod: e.target.value as typeof formData.depositMethod })}
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
                  </div>
                )}
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
                  className="flex-1 px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors border border-brand-hover"
                >
                  {dict?.admin?.createWorkOrder || 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

