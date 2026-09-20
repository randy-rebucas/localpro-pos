'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useLaundryOrderList, type LaundryOrder } from '@/hooks/useLaundryOrderList';
import { useLaundryOrderForm } from '@/hooks/useLaundryOrderForm';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getLaundryStatusColor,
  formatLaundryOrderDateTime,
  getCancelLaundryOrderConfirmMessage,
  getAllowedNextLaundryStatuses,
  isLaundryStatusEditable,
  type LaundryOrderStatus,
} from '@/lib/laundry-helpers';

export default function LaundryOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedOrder, setSelectedOrder] = useState<LaundryOrder | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canManage = canAccess('laundry_orders.manage');

  const { settings } = useTenantSettings();
  const laundryOrdersEnabled = supportsFeature(settings ?? undefined, 'laundryOrders');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { laundryOrders, loading, fetchLaundryOrders, updateLaundryOrder, cancelLaundryOrder } = useLaundryOrderList(tenant, {
    status: filterStatus,
    customerId: 'all',
  });
  const { formData, setFormData, handleSubmit: submitForm, resetForm, addItem, removeItem, updateItem } = useLaundryOrderForm(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchLaundryOrders((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async () => {
        toast.success(dict?.common?.laundryOrderCreatedSuccess || 'Laundry order created successfully');
        await fetchLaundryOrders();
        setShowCreateModal(false);
        resetForm();
      },
      (error) => toast.error(error)
    );
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Pick<LaundryOrder, 'status' | 'notes' | 'totalWeightKg'>>) => {
    await updateLaundryOrder(id, updates, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  const handleCancelOrder = async (id: string) => {
    if (!confirm(getCancelLaundryOrderConfirmMessage(dict))) return;
    await cancelLaundryOrder(id, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  if (loading && laundryOrders.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingLaundryOrders || 'Loading laundry orders...'}</p>
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
              {dict?.admin?.laundryOrders || 'Laundry Orders'}
            </h1>
            <p className="text-sm text-gray-500">{dict?.admin?.laundryOrdersSubtitle || 'Track garments from pickup through wash, dry, fold, and delivery'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              disabled={!laundryOrdersEnabled}
              onClick={() => laundryOrdersEnabled && setShowCreateModal(true)}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-2 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {dict?.admin?.newLaundryOrder || 'New Laundry Order'}
            </button>
          )}
        </div>

        {!laundryOrdersEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict?.admin?.laundryOrdersNotAvailableTitle || 'Laundry Orders Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict?.admin?.laundryOrdersNotAvailableDesc || 'Laundry Orders is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict?.admin?.laundryOrdersNotAvailableHint ||
                    'Enable Laundry Orders under Settings → Business Features, or choose a business type that supports it.'}
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
            <option value="booked">{dict?.admin?.booked || 'Booked'}</option>
            <option value="picked_up">{dict?.admin?.pickedUp || 'Picked Up'}</option>
            <option value="received">{dict?.admin?.received || 'Received'}</option>
            <option value="sorting">{dict?.admin?.sorting || 'Sorting'}</option>
            <option value="washing">{dict?.admin?.washing || 'Washing'}</option>
            <option value="drying">{dict?.admin?.drying || 'Drying'}</option>
            <option value="folding">{dict?.admin?.folding || 'Folding'}</option>
            <option value="ready">{dict?.admin?.ready || 'Ready'}</option>
            <option value="out_for_delivery">{dict?.admin?.outForDelivery || 'Out for Delivery'}</option>
            <option value="completed">{dict?.admin?.completed || 'Completed'}</option>
            <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
          </select>
        </div>

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{dict?.admin?.allLaundryOrders || 'All Laundry Orders'}</h2>
            <span className="text-xs text-gray-400">{laundryOrders.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.order || 'Order'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.customer || 'Customer'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.total || 'Total'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {laundryOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">#{order.id.slice(0, 8)}</div>
                      <div className="text-xs text-gray-500">{formatLaundryOrderDateTime(order.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : dict?.admin?.walkIn || 'Walk-in'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{Number(order.totalAmount).toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getLaundryStatusColor(order.status)}`}>
                        {dict?.admin?.[order.status] || order.status.replace(/_/g, ' ')}
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
            {laundryOrders.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noLaundryOrdersFound || 'No laundry orders found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Status Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.laundryOrderDetails || 'Laundry Order Details'}</h3>
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
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.customer || 'Customer'}</label>
                <p className="mt-1 text-sm text-gray-900">
                  {selectedOrder.customer ? `${selectedOrder.customer.firstName} ${selectedOrder.customer.lastName}` : dict?.admin?.walkIn || 'Walk-in'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedOrder.status}
                  disabled={!canManage || !isLaundryStatusEditable(selectedOrder.status)}
                  onChange={(e) => handleUpdateOrder(selectedOrder.id, { status: e.target.value as LaundryOrderStatus })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAllowedNextLaundryStatuses(selectedOrder.status).map((s) => (
                    <option key={s} value={s}>{dict?.admin?.[s] || s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.garments || 'Garments'}</label>
                  <div className="mt-1 border border-gray-200 divide-y divide-gray-200">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-900">
                          {item.name}
                          {item.tagNumber && <span className="text-gray-400"> · Tag #{item.tagNumber}</span>}
                        </span>
                        <span className="text-gray-500">{item.quantity} x {item.unitPrice} = {item.subtotal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.total || 'Total'}</label>
                <p className="mt-1 text-sm text-gray-900">{Number(selectedOrder.totalAmount).toFixed(2)}</p>
              </div>
              {selectedOrder.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.notes || 'Notes'}</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedOrder.notes}</p>
                </div>
              )}
              {canManage && (
                <div className="flex gap-2 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => handleCancelOrder(selectedOrder.id)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors border border-red-700"
                  >
                    {dict?.common?.cancelLaundryOrder || 'Cancel Laundry Order'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Laundry Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.createNewLaundryOrder || 'Create Laundry Order'}</h3>
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
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.pricingMethod || 'Pricing Method'}</label>
                <select
                  value={formData.pricingMethod}
                  onChange={(e) => setFormData({ ...formData, pricingMethod: e.target.value as 'weight' | 'item' })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="item">{dict?.admin?.perItem || 'Per Item'}</option>
                  <option value="weight">{dict?.admin?.perWeight || 'Per Weight (kg)'}</option>
                </select>
              </div>
              {formData.pricingMethod === 'weight' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.totalWeightKg || 'Total Weight (kg)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.totalWeightKg}
                    onChange={(e) => setFormData({ ...formData, totalWeightKg: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  />
                </div>
              )}

              {/* Garments sub-form */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.garments || 'Garments'}</label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="text-sm text-brand hover:text-brand-navy-deep"
                  >
                    {dict?.admin?.addGarment || '+ Add garment'}
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center border border-gray-200 p-2">
                      <input
                        type="text"
                        placeholder={dict?.admin?.name || 'Name'}
                        value={item.name}
                        onChange={(e) => updateItem(index, { name: e.target.value })}
                        className="flex-1 px-2 py-1 border border-gray-300 text-sm"
                      />
                      <input
                        type="text"
                        placeholder={dict?.admin?.tagNumber || 'Tag #'}
                        value={item.tagNumber}
                        onChange={(e) => updateItem(index, { tagNumber: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-300 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder={dict?.admin?.unitPrice || 'Price'}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
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
                    <p className="text-xs text-gray-400">{dict?.admin?.noGarmentsYet || 'No garments added yet.'}</p>
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
                  {dict?.admin?.createLaundryOrder || 'Create Laundry Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
