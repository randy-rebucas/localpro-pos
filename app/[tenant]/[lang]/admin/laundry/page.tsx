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
import { useLaundryOrderList, type LaundryOrder } from '@/hooks/useLaundryOrderList';
import { useLaundryOrderForm } from '@/hooks/useLaundryOrderForm';
import { usePermissions } from '@/hooks/usePermissions';
import {
  LAUNDRY_ORDER_STATUSES,
  getLaundryStatusColor,
  getLaundryStatusLabel,
  formatLaundryOrderDateTime,
  getCancelLaundryOrderConfirmMessage,
  getAllowedNextLaundryStatuses,
  isLaundryStatusEditable,
  type LaundryOrderStatus,
} from '@/lib/laundry-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

export default function LaundryOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<LaundryOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { canAccess } = usePermissions();
  const canCreate = canAccess('laundry_orders.create');
  const canEdit = canAccess('laundry_orders.edit');
  // Cancelling an order is DELETE on the order.
  const canDelete = canAccess('laundry_orders.delete');

  const { settings } = useTenantSettings();
  const laundryOrdersEnabled = supportsFeature(settings ?? undefined, 'laundryOrders');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  const { laundryOrders, loading, error, fetchLaundryOrders, updateLaundryOrder, cancelLaundryOrder } = useLaundryOrderList(tenant, {
    status: filterStatus,
    customerId: 'all',
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
  } = useLaundryOrderForm(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchLaundryOrders((err) => showToast.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const closeCreate = () => {
    setShowCreate(false);
    resetForm();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm(async () => {
      showToast.success(dict?.common?.laundryOrderCreatedSuccess || 'Laundry order created successfully');
      await fetchLaundryOrders();
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

  const hasFilters = filterStatus !== 'all';
  const walkIn = dict.admin?.walkIn || 'Walk-in';

  const renderBody = () => {
    if (loading && laundryOrders.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingLaundryOrders || 'Loading laundry orders…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchLaundryOrders()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (laundryOrders.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noLaundryOrdersMatch || 'No laundry orders match your filters.')
            : (dict.admin?.noLaundryOrdersYet || 'No laundry orders yet.')}
        </div>
      );
    }

    const viewLabel = dict.common?.view || 'View';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.order || 'Order'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.customer || 'Customer'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.total || 'Total'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {laundryOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-100 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-mono text-xs text-gray-900">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{formatLaundryOrderDateTime(order.createdAt)}</p>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : walkIn}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                  <Currency amount={Number(order.totalAmount)} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-0.5 text-xs font-semibold ${getLaundryStatusColor(order.status)}`}>
                    {getLaundryStatusLabel(order.status, dict)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setSelectedOrder(order); setShowDetail(true); }}
                      title={viewLabel}
                      aria-label={`${viewLabel}: #${order.id.slice(0, 8)}`}
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
          title={dict.admin?.laundryOrders || 'Laundry Orders'}
          description={dict.admin?.laundryOrdersSubtitle || 'Track garments from pickup through wash, dry, fold, and delivery'}
        />

        <div className="space-y-4">
          {!laundryOrdersEnabled && (
            <div className="p-3 bg-white border border-win8-warning text-win8-warning text-sm">
              <p className="font-semibold">{dict.admin?.laundryOrdersNotAvailableTitle || 'Laundry Orders Not Available'}</p>
              <p className="mt-1">
                {(dict.admin?.laundryOrdersNotAvailableDesc || 'Laundry Orders is not enabled for {businessType}.').replace('{businessType}', businessTypeConfig?.name || (dict.admin?.yourBusinessType || 'your business type'))}
              </p>
              <p className="mt-1">
                {dict.admin?.laundryOrdersNotAvailableHint || 'Enable Laundry Orders under Settings → Business Features, or choose a business type that supports it.'}
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
                {LAUNDRY_ORDER_STATUSES.map(({ value: s }) => (
                  <option key={s} value={s}>{getLaundryStatusLabel(s as LaundryOrderStatus, dict)}</option>
                ))}
              </select>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => setFilterStatus('all')}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  {dict.common?.clearFilters || 'Clear Filters'}
                </button>
              )}
            </div>
            {canCreate && (
              <button
                type="button"
                disabled={!laundryOrdersEnabled}
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                + {dict.admin?.newLaundryOrder || 'New Laundry Order'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showDetail} onClose={() => setShowDetail(false)}>
        {selectedOrder && (
          <LaundryDetail
            key={selectedOrder.id}
            order={selectedOrder}
            dict={dict}
            walkIn={walkIn}
            canEdit={canEdit}
            canDelete={canDelete}
            onClose={() => setShowDetail(false)}
            onUpdate={(status) =>
              new Promise<void>((resolve) => {
                updateLaundryOrder(
                  selectedOrder.id,
                  { status },
                  (message) => { showToast.success(message); setShowDetail(false); resolve(); },
                  (err) => { showToast.error(err); resolve(); }
                );
              })
            }
            onCancelOrder={() =>
              new Promise<void>((resolve) => {
                if (!confirm(getCancelLaundryOrderConfirmMessage(dict))) return resolve();
                cancelLaundryOrder(
                  selectedOrder.id,
                  (message) => { showToast.success(message); setShowDetail(false); resolve(); },
                  (err) => { showToast.error(err); resolve(); }
                );
              })
            }
          />
        )}
      </Win8Drawer>

      <Win8Drawer open={showCreate} onClose={closeCreate} widthClass="max-w-2xl">
        <DrawerHeader title={dict.admin?.createNewLaundryOrder || 'Create Laundry Order'} onClose={closeCreate} dict={dict} />
        <form onSubmit={handleCreateOrder} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="laundry-pricing" className={LABEL}>{dict.admin?.pricingMethod || 'Pricing Method'}</label>
                <select
                  id="laundry-pricing"
                  value={formData.pricingMethod}
                  onChange={(e) => setFormData({ ...formData, pricingMethod: e.target.value as 'weight' | 'item' })}
                  className={INPUT}
                >
                  <option value="item">{dict.admin?.perItem || 'Per Item'}</option>
                  <option value="weight">{dict.admin?.perWeight || 'Per Weight (kg)'}</option>
                </select>
              </div>
              {formData.pricingMethod === 'weight' && (
                <div>
                  <label htmlFor="laundry-weight" className={LABEL}>{dict.admin?.totalWeightKg || 'Total Weight (kg)'}</label>
                  <input
                    id="laundry-weight"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.totalWeightKg}
                    onChange={(e) => setFormData({ ...formData, totalWeightKg: e.target.value })}
                    className={`${INPUT} tabular-nums`}
                  />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dict.admin?.garments || 'Garments'}</p>
                <button
                  type="button"
                  onClick={addItem}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
                >
                  {dict.admin?.addGarment || '+ Add garment'}
                </button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center border border-gray-300 p-2">
                    <input
                      type="text"
                      aria-label={dict.admin?.name || 'Name'}
                      placeholder={dict.admin?.name || 'Name'}
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      className="col-span-12 sm:col-span-4 border border-gray-300 px-2 py-2 text-sm"
                    />
                    <input
                      type="text"
                      aria-label={dict.admin?.tagNumber || 'Tag #'}
                      placeholder={dict.admin?.tagNumber || 'Tag #'}
                      value={item.tagNumber}
                      onChange={(e) => updateItem(index, { tagNumber: e.target.value })}
                      className="col-span-4 sm:col-span-2 border border-gray-300 px-2 py-2 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={dict.admin?.unitPrice || 'Price'}
                      placeholder={dict.admin?.unitPrice || 'Price'}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                      className="col-span-4 sm:col-span-3 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                    />
                    <input
                      type="number"
                      min="1"
                      aria-label={dict.admin?.quantity || 'Qty'}
                      placeholder={dict.admin?.quantity || 'Qty'}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      className="col-span-2 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      title={dict.common?.remove || 'Remove'}
                      aria-label={dict.common?.remove || 'Remove'}
                      className={`col-span-2 sm:col-span-1 ${ICON_BUTTON} bg-win8-danger`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {formData.items.length === 0 && (
                  <p className="text-sm text-gray-400 italic">{dict.admin?.noGarmentsYet || 'No garments added yet.'}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="laundry-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
              <textarea
                id="laundry-notes"
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
              {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.createLaundryOrder || 'Create Laundry Order')}
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

function LaundryDetail({
  order,
  dict,
  walkIn,
  canEdit,
  canDelete,
  onClose,
  onUpdate,
  onCancelOrder,
}: {
  order: LaundryOrder;
  dict: TranslationDict;
  walkIn: string;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onUpdate: (status: LaundryOrderStatus) => Promise<void>;
  onCancelOrder: () => Promise<void>;
}) {
  const [status, setStatus] = useState<LaundryOrderStatus>(order.status);
  const [busy, setBusy] = useState(false);

  const statusEditable = canEdit && isLaundryStatusEditable(order.status);
  const canCancel = canDelete && getAllowedNextLaundryStatuses(order.status).includes('cancelled') && order.status !== 'cancelled';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onUpdate(status);
    setBusy(false);
  };

  const cancelOrder = async () => {
    setBusy(true);
    await onCancelOrder();
    setBusy(false);
  };

  return (
    <>
      <DrawerHeader title={dict.admin?.laundryOrderDetails || 'Laundry Order Details'} onClose={onClose} dict={dict} />
      <form onSubmit={save} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className={LABEL}>{dict.admin?.order || 'Order'}</p>
              <p className="font-mono text-xs text-gray-900">#{order.id.slice(0, 8)}</p>
            </div>
            <div>
              <p className={LABEL}>{dict.admin?.customer || 'Customer'}</p>
              <p className="text-gray-900">{order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : walkIn}</p>
            </div>
            <div>
              <p className={LABEL}>{dict.admin?.status || 'Status'}</p>
              <span className={`px-2 py-0.5 text-xs font-semibold ${getLaundryStatusColor(order.status)}`}>{getLaundryStatusLabel(order.status, dict)}</span>
            </div>
            <div>
              <p className={LABEL}>{dict.admin?.total || 'Total'}</p>
              <p className="font-semibold tabular-nums text-gray-900"><Currency amount={Number(order.totalAmount)} /></p>
            </div>
          </div>
          {order.items && order.items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dict.admin?.garments || 'Garments'}</p>
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-200 border-y border-gray-200">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 text-gray-900">
                        {item.name}
                        {item.tagNumber && <span className="ml-1 text-xs font-mono text-gray-400">#{item.tagNumber}</span>}
                      </td>
                      <td className="py-2 text-right text-xs text-gray-500 tabular-nums">
                        {item.quantity} × <Currency amount={Number(item.unitPrice)} />
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
          <hr className="border-gray-300" />
          <div>
            <label htmlFor="laundry-detail-status" className={LABEL}>{dict.admin?.status || 'Status'}</label>
            <select
              id="laundry-detail-status"
              value={status}
              disabled={!statusEditable}
              onChange={(e) => setStatus(e.target.value as LaundryOrderStatus)}
              className={`${INPUT} disabled:bg-gray-100`}
            >
              {getAllowedNextLaundryStatuses(order.status)
                // Cancelling goes through the dedicated button so it gets a confirm.
                .filter((s) => s !== 'cancelled' || order.status === 'cancelled')
                .map((s) => (
                  <option key={s} value={s}>{getLaundryStatusLabel(s as LaundryOrderStatus, dict)}</option>
                ))}
            </select>
          </div>
          {order.notes && (
            <div>
              <p className={LABEL}>{dict.admin?.notes || 'Notes'}</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{order.notes}</p>
            </div>
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
              {dict.common?.cancelLaundryOrder || 'Cancel Laundry Order'}
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
                disabled={busy || status === order.status}
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
