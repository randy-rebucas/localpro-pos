'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useDeliveryList, type DeliveryOrder } from '@/hooks/useDeliveryList';
import { useDeliveryForm } from '@/hooks/useDeliveryForm';
import { useRiderList } from '@/hooks/useRiderList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getStatusColor,
  formatDeliveryDateTime,
  getDeleteDeliveryConfirmMessage,
  getAllowedNextStatuses,
  isDeliveryStatusEditable,
  type DeliveryStatus,
} from '@/lib/delivery-helpers';

export default function DeliveryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRider, setFilterRider] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canManage = canAccess('delivery.manage');

  const { settings } = useTenantSettings();
  const deliveryEnabled = supportsFeature(settings ?? undefined, 'delivery');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { deliveryOrders, loading, fetchDeliveryOrders, updateDeliveryOrder, cancelDeliveryOrder } = useDeliveryList(tenant, {
    status: filterStatus,
    riderId: filterRider,
  });
  const { formData, setFormData, handleSubmit: submitForm, resetForm } = useDeliveryForm(tenant);
  const { riders, fetchRiders } = useRiderList(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchDeliveryOrders((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterRider]);

  useEffect(() => {
    fetchRiders((error) => toast.error(error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(
      async () => {
        toast.success(dict?.common?.deliveryCreatedSuccess || 'Delivery order created successfully');
        await fetchDeliveryOrders();
        setShowCreateModal(false);
        resetForm();
      },
      (error) => toast.error(error)
    );
  };

  const handleUpdateOrder = async (id: string, updates: Partial<Pick<DeliveryOrder, 'status' | 'riderId' | 'notes' | 'failureReason'>>) => {
    await updateDeliveryOrder(id, updates, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  const handleCancelOrder = async (id: string) => {
    if (!confirm(getDeleteDeliveryConfirmMessage(dict))) return;
    await cancelDeliveryOrder(id, (message) => {
      toast.success(message);
      setShowModal(false);
      setSelectedOrder(null);
    }, (error) => toast.error(error));
  };

  if (loading && deliveryOrders.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.admin?.loadingDeliveries || 'Loading delivery orders...'}</p>
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
              {dict?.admin?.delivery || 'Pickup & Delivery'}
            </h1>
            <p className="text-sm text-gray-500">{dict?.admin?.deliverySubtitle || 'Manage delivery orders and rider assignments'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              disabled={!deliveryEnabled}
              onClick={() => deliveryEnabled && setShowCreateModal(true)}
              className="px-4 py-2 bg-brand text-white hover:bg-brand-hover transition-colors flex items-center gap-2 border border-brand-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {dict?.admin?.newDelivery || 'New Delivery Order'}
            </button>
          )}
        </div>

        {!deliveryEnabled && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  {dict?.admin?.deliveryNotAvailableTitle || 'Pickup & Delivery Not Available'}
                </h3>
                <p className="text-yellow-800">
                  {(dict?.admin?.deliveryNotAvailableDesc || 'Pickup & Delivery is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  {dict?.admin?.deliveryNotAvailableHint ||
                    'Enable Delivery under Settings → Business, or choose a business type that supports delivery.'}
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
            <option value="picked_up">{dict?.admin?.pickedUp || 'Picked Up'}</option>
            <option value="in_transit">{dict?.admin?.inTransit || 'In Transit'}</option>
            <option value="delivered">{dict?.admin?.delivered || 'Delivered'}</option>
            <option value="failed">{dict?.admin?.failed || 'Failed'}</option>
            <option value="cancelled">{dict?.admin?.cancelled || 'Cancelled'}</option>
          </select>
          <select
            value={filterRider}
            onChange={(e) => setFilterRider(e.target.value)}
            className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
          >
            <option value="all">{dict?.admin?.allRiders || 'All Riders'}</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white border border-gray-300 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{dict?.admin?.allDeliveries || 'All Delivery Orders'}</h2>
            <span className="text-xs text-gray-400">{deliveryOrders.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.address || 'Address'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.rider || 'Rider'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dict?.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deliveryOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{order.addressStreet}, {order.addressCity}</div>
                      <div className="text-xs text-gray-500">{formatDeliveryDateTime(order.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 capitalize">{order.type}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{order.rider?.name || dict?.admin?.unassigned || 'Unassigned'}</td>
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
            {deliveryOrders.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {dict?.admin?.noDeliveriesFound || 'No delivery orders found'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Assign Rider Modal */}
      {showModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.deliveryDetails || 'Delivery Order Details'}</h3>
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
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.address || 'Address'}</label>
                <p className="mt-1 text-sm text-gray-900">
                  {selectedOrder.addressStreet}, {selectedOrder.addressCity}
                  {selectedOrder.addressState ? `, ${selectedOrder.addressState}` : ''}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.rider || 'Rider'}</label>
                <select
                  value={selectedOrder.riderId || ''}
                  disabled={!canManage}
                  onChange={(e) => handleUpdateOrder(selectedOrder.id, { riderId: e.target.value || undefined })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.status || 'Status'}</label>
                <select
                  value={selectedOrder.status}
                  disabled={!canManage || !isDeliveryStatusEditable(selectedOrder.status)}
                  onChange={(e) => handleUpdateOrder(selectedOrder.id, { status: e.target.value as DeliveryStatus })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {getAllowedNextStatuses(selectedOrder.status).map((s) => (
                    <option key={s} value={s}>{dict?.admin?.[s] || s}</option>
                  ))}
                </select>
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
                    {dict?.common?.cancelDelivery || 'Cancel Delivery'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Delivery Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{dict?.admin?.createNewDelivery || 'Create Delivery Order'}</h3>
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
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.type || 'Type'} *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'pickup' | 'delivery' })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="delivery">{dict?.admin?.delivery || 'Delivery'}</option>
                  <option value="pickup">{dict?.admin?.pickup || 'Pickup'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.addressStreet || 'Street'} *</label>
                <input
                  type="text"
                  required
                  value={formData.addressStreet}
                  onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.addressCity || 'City'} *</label>
                  <input
                    type="text"
                    required
                    value={formData.addressCity}
                    onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{dict?.admin?.addressCountry || 'Country'} *</label>
                  <input
                    type="text"
                    required
                    value={formData.addressCountry}
                    onChange={(e) => setFormData({ ...formData, addressCountry: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{dict?.admin?.rider || 'Rider'}</label>
                <select
                  value={formData.riderId}
                  onChange={(e) => setFormData({ ...formData, riderId: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand focus:border-brand bg-white"
                >
                  <option value="">{dict?.admin?.unassigned || 'Unassigned'}</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
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
                  {dict?.admin?.createDelivery || 'Create Delivery Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
