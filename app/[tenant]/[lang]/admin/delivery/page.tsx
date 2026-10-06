'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { supportsFeature, getBusinessType } from '@/lib/business-type-helpers';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { useDeliveryList, type DeliveryOrder } from '@/hooks/useDeliveryList';
import { useDeliveryForm } from '@/hooks/useDeliveryForm';
import { useRiderList } from '@/hooks/useRiderList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  DELIVERY_STATUSES,
  getStatusColor,
  getStatusLabel,
  formatDeliveryDateTime,
  getDeleteDeliveryConfirmMessage,
  getAllowedNextStatuses,
  isDeliveryStatusEditable,
  type DeliveryStatus,
} from '@/lib/delivery-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function DeliveryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRider, setFilterRider] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canCreate = canAccess('delivery.create');
  const canEdit = canAccess('delivery.edit');
  // Cancelling an order is DELETE on the order.
  const canDelete = canAccess('delivery.delete');

  const { settings } = useTenantSettings();
  const deliveryEnabled = supportsFeature(settings ?? undefined, 'delivery');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { deliveryOrders, loading, error, fetchDeliveryOrders, updateDeliveryOrder, cancelDeliveryOrder } = useDeliveryList(tenant, {
    status: filterStatus,
    riderId: filterRider,
  });
  const { formData, setFormData, submitting, error: formError, handleSubmit: submitForm, resetForm } = useDeliveryForm(tenant);
  const { riders, fetchRiders } = useRiderList(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchDeliveryOrders((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterRider]);

  useEffect(() => {
    fetchRiders((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setShowDetail(true);
  };

  const closeCreate = () => {
    setShowCreate(false);
    resetForm();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(async () => {
      showToast.success(dict?.common?.deliveryCreatedSuccess || 'Delivery order created successfully');
      await fetchDeliveryOrders();
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

  const hasFilters = filterStatus !== 'all' || filterRider !== 'all';

  const renderBody = () => {
    if (loading && deliveryOrders.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingDeliveries || 'Loading delivery orders…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchDeliveryOrders()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (deliveryOrders.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noDeliveriesMatch || 'No delivery orders match your filters.')
            : (dict.admin?.noDeliveriesYet || 'No delivery orders yet.')}
        </div>
      );
    }

    const viewLabel = dict.common?.view || 'View';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.address || 'Address'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.type || 'Type'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.rider || 'Rider'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deliveryOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{order.addressStreet}, {order.addressCity}</p>
                  <p className="text-xs text-gray-500">{formatDeliveryDateTime(order.createdAt)}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {order.type === 'pickup' ? (dict.admin?.pickup || 'Pickup') : (dict.admin?.deliveryType || 'Delivery')}
                </td>
                <td className="px-4 py-3 text-gray-700">{order.rider?.name || <span className="text-gray-400">{dict.admin?.unassigned || 'Unassigned'}</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status, dict)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => openDetail(order)}
                      title={viewLabel}
                      aria-label={`${viewLabel}: ${order.addressStreet}`}
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

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.delivery || 'Pickup & Delivery'}
          description={dict.admin?.deliverySubtitle || 'Manage delivery orders and rider assignments'}
        />

        <div className="space-y-4">
          {!deliveryEnabled && (
            <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
              <p className="font-semibold">{dict.admin?.deliveryNotAvailableTitle || 'Pickup & Delivery Not Available'}</p>
              <p className="mt-1">
                {(dict.admin?.deliveryNotAvailableDesc || 'Pickup & Delivery is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || (dict.admin?.yourBusinessType || 'your business type'))}
              </p>
              <p className="mt-1">
                {dict.admin?.deliveryNotAvailableHint || 'Enable Delivery under Settings → Business, or choose a business type that supports delivery.'}
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
                {DELIVERY_STATUSES.map(({ value: s }) => (
                  <option key={s} value={s}>{getStatusLabel(s as DeliveryStatus, dict)}</option>
                ))}
              </select>
              <select
                aria-label={dict.admin?.filterByRider || 'Filter by rider'}
                value={filterRider}
                onChange={(e) => setFilterRider(e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
              >
                <option value="all">{dict.admin?.allRiders || 'All Riders'}</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setFilterStatus('all'); setFilterRider('all'); }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {dict.common?.clearFilters || 'Clear Filters'}
                </button>
              )}
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={!deliveryEnabled}
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                + {dict.admin?.newDelivery || 'New Delivery Order'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showDetail} onClose={() => setShowDetail(false)}>
        {selectedOrder && (
          <DeliveryDetail
            key={selectedOrder.id}
            order={selectedOrder}
            riders={riders}
            dict={dict}
            canEdit={canEdit}
            canDelete={canDelete}
            onClose={() => setShowDetail(false)}
            onUpdate={(updates) =>
              new Promise<void>((resolve) => {
                updateDeliveryOrder(
                  selectedOrder.id,
                  updates,
                  (message) => {
                    showToast.success(message);
                    setShowDetail(false);
                    resolve();
                  },
                  (err) => {
                    showToast.error(err);
                    resolve();
                  }
                );
              })
            }
            onCancelOrder={() =>
              new Promise<void>((resolve) => {
                if (!confirm(getDeleteDeliveryConfirmMessage(dict))) return resolve();
                cancelDeliveryOrder(
                  selectedOrder.id,
                  (message) => {
                    showToast.success(message);
                    setShowDetail(false);
                    resolve();
                  },
                  (err) => {
                    showToast.error(err);
                    resolve();
                  }
                );
              })
            }
          />
        )}
      </Win8Drawer>

      <Win8Drawer open={showCreate} onClose={closeCreate} widthClass="max-w-2xl">
        <DrawerHeader title={dict.admin?.createNewDelivery || 'Create Delivery Order'} onClose={closeCreate} dict={dict} />
        <form onSubmit={handleCreateOrder} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="delivery-type" className={LABEL}>{dict.admin?.type || 'Type'} <span className="text-win8-danger">*</span></label>
                <select
                  id="delivery-type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'pickup' | 'delivery' })}
                  className={INPUT}
                >
                  <option value="delivery">{dict.admin?.deliveryType || 'Delivery'}</option>
                  <option value="pickup">{dict.admin?.pickup || 'Pickup'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="delivery-scheduled" className={LABEL}>{dict.admin?.scheduledAt || 'Scheduled For'}</label>
                <input
                  id="delivery-scheduled"
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>
            <div>
              <label htmlFor="delivery-street" className={LABEL}>{dict.admin?.addressStreet || 'Street'} <span className="text-win8-danger">*</span></label>
              <input
                id="delivery-street"
                type="text"
                required
                value={formData.addressStreet}
                onChange={(e) => setFormData({ ...formData, addressStreet: e.target.value })}
                className={INPUT}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="delivery-city" className={LABEL}>{dict.admin?.addressCity || 'City'} <span className="text-win8-danger">*</span></label>
                <input
                  id="delivery-city"
                  type="text"
                  required
                  value={formData.addressCity}
                  onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="delivery-state" className={LABEL}>{dict.admin?.addressState || 'State / Province'}</label>
                <input
                  id="delivery-state"
                  type="text"
                  value={formData.addressState}
                  onChange={(e) => setFormData({ ...formData, addressState: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="delivery-zip" className={LABEL}>{dict.admin?.addressZipCode || 'ZIP / Postal Code'}</label>
                <input
                  id="delivery-zip"
                  type="text"
                  value={formData.addressZipCode}
                  onChange={(e) => setFormData({ ...formData, addressZipCode: e.target.value })}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="delivery-country" className={LABEL}>{dict.admin?.addressCountry || 'Country'} <span className="text-win8-danger">*</span></label>
                <input
                  id="delivery-country"
                  type="text"
                  required
                  value={formData.addressCountry}
                  onChange={(e) => setFormData({ ...formData, addressCountry: e.target.value })}
                  className={INPUT}
                />
              </div>
            </div>
            <div>
              <label htmlFor="delivery-rider" className={LABEL}>{dict.admin?.rider || 'Rider'}</label>
              <select
                id="delivery-rider"
                value={formData.riderId}
                onChange={(e) => setFormData({ ...formData, riderId: e.target.value })}
                className={INPUT}
              >
                <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="delivery-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
              <textarea
                id="delivery-notes"
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
              {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.createDelivery || 'Create Delivery Order')}
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

function DeliveryDetail({
  order,
  riders,
  dict,
  canEdit,
  canDelete,
  onClose,
  onUpdate,
  onCancelOrder,
}: {
  order: DeliveryOrder;
  riders: { id: string; name: string }[];
  dict: TranslationDict;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Pick<DeliveryOrder, 'status' | 'riderId' | 'failureReason'>>) => Promise<void>;
  onCancelOrder: () => Promise<void>;
}) {
  const [riderId, setRiderId] = useState(order.riderId || '');
  const [status, setStatus] = useState<DeliveryStatus>(order.status);
  const [failureReason, setFailureReason] = useState(order.failureReason || '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const statusEditable = canEdit && isDeliveryStatusEditable(order.status);
  // Cancel is a transition too; only offer it while the order can still move.
  const canCancel = canDelete && getAllowedNextStatuses(order.status).includes('cancelled') && order.status !== 'cancelled';
  const dirty = riderId !== (order.riderId || '') || status !== order.status;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (status === 'failed' && !failureReason.trim()) {
      setFormError(dict.admin?.failureReasonRequired || 'Enter a reason for the failed delivery.');
      return;
    }
    const updates: Partial<Pick<DeliveryOrder, 'status' | 'riderId' | 'failureReason'>> = {};
    // null (not undefined) so the field survives JSON.stringify and the API clears the rider.
    if (riderId !== (order.riderId || '')) updates.riderId = riderId || null;
    if (status !== order.status) updates.status = status;
    if (status === 'failed') updates.failureReason = failureReason.trim();
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
      <DrawerHeader title={dict.admin?.deliveryDetails || 'Delivery Order Details'} onClose={onClose} dict={dict} />
      <form onSubmit={save} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <p className={LABEL}>{dict.admin?.address || 'Address'}</p>
            <p className="text-sm text-gray-900">
              {order.addressStreet}, {order.addressCity}
              {order.addressState ? `, ${order.addressState}` : ''}
              {order.addressZipCode ? ` ${order.addressZipCode}` : ''}
              {order.addressCountry ? `, ${order.addressCountry}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className={LABEL}>{dict.admin?.type || 'Type'}</p>
              <p className="text-gray-900">{order.type === 'pickup' ? (dict.admin?.pickup || 'Pickup') : (dict.admin?.deliveryType || 'Delivery')}</p>
            </div>
            <div>
              <p className={LABEL}>{dict.admin?.status || 'Status'}</p>
              <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(order.status)}`}>{getStatusLabel(order.status, dict)}</span>
            </div>
            {order.customer && (
              <div>
                <p className={LABEL}>{dict.admin?.customer || 'Customer'}</p>
                <p className="text-gray-900">{order.customer.firstName} {order.customer.lastName}</p>
                {order.customer.phone && <p className="text-xs text-gray-500">{order.customer.phone}</p>}
              </div>
            )}
            {order.scheduledAt && (
              <div>
                <p className={LABEL}>{dict.admin?.scheduledAt || 'Scheduled For'}</p>
                <p className="text-gray-900">{formatDeliveryDateTime(order.scheduledAt)}</p>
              </div>
            )}
          </div>
          <hr className="border-gray-300" />
          <div>
            <label htmlFor="detail-rider" className={LABEL}>{dict.admin?.rider || 'Rider'}</label>
            <select
              id="detail-rider"
              value={riderId}
              disabled={!canEdit}
              onChange={(e) => setRiderId(e.target.value)}
              className={`${INPUT} disabled:bg-gray-100`}
            >
              <option value="">{dict.admin?.unassigned || 'Unassigned'}</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="detail-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
            <select
              id="detail-status"
              value={status}
              disabled={!statusEditable}
              onChange={(e) => setStatus(e.target.value as DeliveryStatus)}
              className={`${INPUT} disabled:bg-gray-100`}
            >
              {getAllowedNextStatuses(order.status)
                // Cancelling goes through the dedicated button so it gets a confirm.
                .filter((s) => s !== 'cancelled' || order.status === 'cancelled')
                .map((s) => (
                  <option key={s} value={s}>{getStatusLabel(s as DeliveryStatus, dict)}</option>
                ))}
            </select>
          </div>
          {(status === 'failed' || order.failureReason) && (
            <div>
              <label htmlFor="detail-failure" className={LABEL}>
                {dict.admin?.failureReason || 'Failure Reason'} {status === 'failed' && order.status !== 'failed' && <span className="text-win8-danger">*</span>}
              </label>
              <textarea
                id="detail-failure"
                rows={2}
                value={failureReason}
                disabled={order.status === 'failed'}
                onChange={(e) => setFailureReason(e.target.value)}
                className={`${INPUT} resize-none disabled:bg-gray-100`}
              />
            </div>
          )}
          {order.notes && (
            <div>
              <p className={LABEL}>{dict.admin?.notes || 'Notes'}</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
          {formError && <div className="bg-win8-danger text-white text-sm p-3">{formError}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 shrink-0">
          {canCancel && (
            <button
              type="button"
              onClick={cancelOrder}
              disabled={busy}
              className="px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
            >
              {dict.common?.cancelDelivery || 'Cancel Delivery'}
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
