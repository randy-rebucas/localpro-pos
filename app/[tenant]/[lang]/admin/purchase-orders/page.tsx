'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { useSupplierList } from '@/hooks/useSupplierList';
import {
  usePurchaseOrderList,
  type PurchaseOrder,
  type PurchaseOrderItemInput,
} from '@/hooks/usePurchaseOrderList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getStatusColor,
  getStatusLabel,
  getAllowedNextStatuses,
  isPurchaseOrderStatusEditable,
  formatPurchaseOrderDate,
  type PurchaseOrderStatus,
} from '@/lib/purchase-order-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const INPUT = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const LABEL = 'block text-xs font-medium text-gray-600 mb-1';

type ProductOption = { _id: string; name: string; sku?: string };

export default function PurchaseOrdersPage() {
  const params = useParams();
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('purchase_orders.create');
  // Mark ordered / cancel are status updates (PUT /api/purchase-orders/[id]).
  const canEdit = canAccess('purchase_orders.edit');
  const canDelete = canAccess('purchase_orders.delete');
  const canReceive = canAccess('purchase_orders.receive');

  const {
    purchaseOrders,
    loading,
    error,
    message,
    fetchPurchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
    receiveItems,
    setMessage,
  } = usePurchaseOrderList();

  const { suppliers, fetchSuppliers } = useSupplierList();

  // The hook's own messages are English; only surface its errors (e.g. delete failures).
  // Success toasts are raised by this page in the user's language.
  useEffect(() => {
    if (!message) return;
    if (message.type === 'error') showToast.error(message.text);
    setMessage(null);
  }, [message, setMessage]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchPurchaseOrders();
    fetchSuppliers();
  }, [fetchPurchaseOrders, fetchSuppliers]);

  // Unpaginated: the paginated products API caps at 100 per page, which hid the
  // rest of a larger catalog from the line-item picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/products?isActive=true', { credentials: 'include' });
        const data = await res.json();
        if (!cancelled && data.success) {
          setProducts(
            (data.data || []).map((p: { _id?: string; id?: string; name: string; sku?: string }) => ({
              _id: p._id || p.id || '',
              name: p.name,
              sku: p.sku,
            }))
          );
        }
      } catch {
        // The create drawer shows an empty picker; the list itself is unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const handleStatusChange = async (po: PurchaseOrder, status: PurchaseOrderStatus) => {
    if (status === 'cancelled') {
      const msg = (dict.admin?.poCancelConfirm || 'Cancel purchase order "{number}"? This cannot be undone.').replace('{number}', po.orderNumber);
      if (!confirm(msg)) return;
    }
    setBusyId(po._id);
    const result = await updatePurchaseOrderStatus(po._id, status);
    setBusyId(null);
    if (result === true) {
      showToast.success(
        status === 'cancelled'
          ? (dict.admin?.poCancelled || 'Purchase order cancelled')
          : (dict.admin?.poMarkedOrdered || 'Purchase order marked as ordered')
      );
      await fetchPurchaseOrders();
    } else {
      showToast.error(result);
    }
  };

  const handleDelete = async (po: PurchaseOrder) => {
    const msg = (dict.admin?.poDeleteConfirm || 'Delete draft purchase order "{number}"? This cannot be undone.').replace('{number}', po.orderNumber);
    if (!confirm(msg)) return;
    setBusyId(po._id);
    const success = await deletePurchaseOrder(po._id);
    setBusyId(null);
    if (success) {
      showToast.success(dict.admin?.poDeleted || 'Purchase order deleted');
      await fetchPurchaseOrders();
    }
  };

  const openCreate = () => {
    setFormKey((k) => k + 1);
    setShowCreate(true);
  };

  const openReceive = (po: PurchaseOrder) => {
    setReceivingOrder(po);
    setShowReceive(true);
  };

  const showRowActions = canEdit || canDelete || canReceive;

  const renderBody = () => {
    if (loading && purchaseOrders.length === 0) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingPurchaseOrders || 'Loading purchase orders…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchPurchaseOrders()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (purchaseOrders.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {dict.admin?.noPurchaseOrdersYet || 'No purchase orders yet.'}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.poNumber || 'PO #'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.supplier || 'Supplier'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.items || 'Items'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.total || 'Total'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.expectedDate || 'Expected'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
              {showRowActions && <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {purchaseOrders.map((po) => {
              const busy = busyId === po._id;
              const canCancelPo = canEdit && isPurchaseOrderStatusEditable(po.status) && getAllowedNextStatuses(po.status).includes('cancelled');
              const receiveLabel = dict.admin?.receive || 'Receive';
              const orderedLabel = dict.admin?.markOrdered || 'Mark Ordered';
              const cancelLabel = dict.common?.cancel || 'Cancel';
              const deleteLabel = dict.common?.delete || 'Delete';
              return (
                <tr key={po._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-gray-900">{po.orderNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{po.supplier?.name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{po.items.length}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900"><Currency amount={po.totalAmount} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                    {po.expectedDate ? formatPurchaseOrderDate(po.expectedDate) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(po.status)}`}>
                      {getStatusLabel(po.status, dict)}
                    </span>
                  </td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canReceive && (po.status === 'ordered' || po.status === 'partially_received') && (
                          <button type="button" onClick={() => openReceive(po)} disabled={busy} title={receiveLabel} aria-label={`${receiveLabel}: ${po.orderNumber}`} className={`${ICON_BUTTON} bg-win8-success`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0 0-4-4m4 4 4-4" />
                            </svg>
                          </button>
                        )}
                        {canEdit && po.status === 'draft' && (
                          <button type="button" onClick={() => handleStatusChange(po, 'ordered')} disabled={busy} title={orderedLabel} aria-label={`${orderedLabel}: ${po.orderNumber}`} className={`${ICON_BUTTON} bg-win8-info`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" />
                            </svg>
                          </button>
                        )}
                        {canCancelPo && (
                          <button type="button" onClick={() => handleStatusChange(po, 'cancelled')} disabled={busy} title={cancelLabel} aria-label={`${cancelLabel}: ${po.orderNumber}`} className={`${ICON_BUTTON} bg-win8-suspended`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" />
                            </svg>
                          </button>
                        )}
                        {canDelete && po.status === 'draft' && (
                          <button type="button" onClick={() => handleDelete(po)} disabled={busy} title={deleteLabel} aria-label={`${deleteLabel}: ${po.orderNumber}`} className={`${ICON_BUTTON} bg-win8-danger`}>
                            {busy ? (
                              <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.purchaseOrders || 'Purchase Orders'}
          description={dict.admin?.purchaseOrdersSubtitle || 'Order stock from suppliers and receive it into inventory'}
        />

        <div className="space-y-4">
          {canCreate && (
            <div className="flex items-center justify-between gap-3 flex-wrap bg-white border border-gray-300 p-3">
              <p className="text-sm text-gray-500">
                {suppliers.length === 0 && !loading ? (dict.admin?.poAddSupplierFirst || 'Add a supplier first to create purchase orders.') : ''}
              </p>
              <button
                type="button"
                onClick={openCreate}
                disabled={suppliers.length === 0}
                className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
              >
                + {dict.admin?.newPurchaseOrder || 'New Purchase Order'}
              </button>
            </div>
          )}

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showCreate} onClose={() => setShowCreate(false)} widthClass="max-w-2xl">
        <CreatePurchaseOrderForm
          key={formKey}
          dict={dict}
          suppliers={suppliers}
          products={products}
          onClose={() => setShowCreate(false)}
          onSave={async () => {
            showToast.success(dict.admin?.poCreated || 'Purchase order created successfully');
            setShowCreate(false);
            await fetchPurchaseOrders();
          }}
          createPurchaseOrder={createPurchaseOrder}
        />
      </Win8Drawer>

      <Win8Drawer open={showReceive} onClose={() => setShowReceive(false)} widthClass="max-w-2xl">
        {receivingOrder && (
          <ReceiveForm
            key={receivingOrder._id}
            dict={dict}
            purchaseOrder={receivingOrder}
            onClose={() => setShowReceive(false)}
            onSave={async () => {
              showToast.success(dict.admin?.poStockReceived || 'Stock received successfully');
              setShowReceive(false);
              await fetchPurchaseOrders();
            }}
            receiveItems={receiveItems}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function DrawerHeader({ title, subtitle, onClose, dict }: { title: string; subtitle?: string; onClose: () => void; dict: TranslationDict }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/70 truncate">{subtitle}</p>}
      </div>
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

function CreatePurchaseOrderForm({
  dict,
  suppliers,
  products,
  onClose,
  onSave,
  createPurchaseOrder,
}: {
  dict: TranslationDict;
  suppliers: { _id: string; name: string }[];
  products: ProductOption[];
  onClose: () => void;
  onSave: () => Promise<void>;
  createPurchaseOrder: (form: { supplierId: string; notes?: string; expectedDate?: string; items: PurchaseOrderItemInput[] }) => Promise<true | string>;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?._id || '');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderItemInput[]>([{ productId: '', quantityOrdered: 1, unitCost: 0 }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.quantityOrdered) || 0) * (Number(line.unitCost) || 0), 0),
    [lines]
  );

  const updateLine = (index: number, patch: Partial<PurchaseOrderItemInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validLines = lines.filter((line) => line.productId && line.quantityOrdered > 0);
    if (!supplierId) {
      setError(dict.admin?.poSupplierRequired || 'Supplier is required');
      return;
    }
    if (validLines.length === 0) {
      setError(dict.admin?.poAddOneItem || 'Add at least one item');
      return;
    }
    setSubmitting(true);
    const result = await createPurchaseOrder({
      supplierId,
      notes: notes || undefined,
      expectedDate: expectedDate || undefined,
      items: validLines,
    });
    setSubmitting(false);
    if (result === true) {
      await onSave();
    } else {
      setError(result);
    }
  };

  const removeLabel = dict.common?.remove || 'Remove';

  return (
    <>
      <DrawerHeader title={dict.admin?.newPurchaseOrder || 'New Purchase Order'} onClose={onClose} dict={dict} />
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="po-supplier" className={LABEL}>{dict.admin?.supplier || 'Supplier'} <span className="text-win8-danger">*</span></label>
              <select id="po-supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={INPUT}>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="po-expected" className={LABEL}>{dict.admin?.expectedDate || 'Expected Date'}</label>
              <input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={INPUT} />
            </div>
          </div>

          <div>
            <label htmlFor="po-notes" className={LABEL}>{dict.admin?.notes || 'Notes'}</label>
            <textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${INPUT} resize-none`} />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {dict.admin?.items || 'Items'} <span className="text-win8-danger">*</span>
              </p>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { productId: '', quantityOrdered: 1, unitCost: 0 }])}
                className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
              >
                {dict.admin?.addLineItem || '+ Add line'}
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    aria-label={dict.admin?.product || 'Product'}
                    value={line.productId}
                    onChange={(e) => updateLine(index, { productId: e.target.value })}
                    className="col-span-12 sm:col-span-6 border border-gray-300 px-2 py-2 bg-white text-sm"
                  >
                    <option value="">{dict.admin?.selectProduct || 'Select product…'}</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}{p.sku ? ` (${p.sku})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    aria-label={dict.admin?.quantity || 'Qty'}
                    placeholder={dict.admin?.quantity || 'Qty'}
                    value={line.quantityOrdered}
                    onChange={(e) => updateLine(index, { quantityOrdered: parseInt(e.target.value) || 1 })}
                    className="col-span-4 sm:col-span-2 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={dict.admin?.unitCost || 'Unit cost'}
                    placeholder={dict.admin?.unitCost || 'Unit cost'}
                    value={line.unitCost}
                    onChange={(e) => updateLine(index, { unitCost: parseFloat(e.target.value) || 0 })}
                    className="col-span-5 sm:col-span-3 border border-gray-300 px-2 py-2 text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                    title={removeLabel}
                    aria-label={removeLabel}
                    className={`col-span-3 sm:col-span-1 ${ICON_BUTTON} bg-win8-danger`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="text-right mt-3 text-sm font-semibold text-gray-900 tabular-nums">
              {dict.admin?.total || 'Total'}: <Currency amount={total} />
            </div>
          </div>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors">
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors">
            {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.createPurchaseOrder || 'Create Purchase Order')}
          </button>
        </div>
      </form>
    </>
  );
}

function ReceiveForm({
  dict,
  purchaseOrder,
  onClose,
  onSave,
  receiveItems,
}: {
  dict: TranslationDict;
  purchaseOrder: PurchaseOrder;
  onClose: () => void;
  onSave: () => Promise<void>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
}) {
  // The input is the quantity arriving *now*. The API wants the running total
  // received-to-date per line, so we add the already-received amount on submit.
  // Defaulting to the remaining quantity keeps "receive everything" one click.
  const [incoming, setIncoming] = useState<Record<string, number>>(
    Object.fromEntries(
      purchaseOrder.items.map((item) => [item._id, Math.max(0, item.quantityOrdered - item.quantityReceived)])
    )
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalIncoming = Object.values(incoming).reduce((sum, n) => sum + n, 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (totalIncoming === 0) {
      setError(dict.admin?.poNothingToReceive || 'Enter a quantity for at least one item.');
      return;
    }
    setSubmitting(true);
    const result = await receiveItems(
      purchaseOrder._id,
      purchaseOrder.items.map((item) => ({
        itemId: item._id,
        quantityReceived: item.quantityReceived + (incoming[item._id] ?? 0),
      }))
    );
    setSubmitting(false);
    if (result === true) {
      await onSave();
    } else {
      setError(result);
    }
  };

  return (
    <>
      <DrawerHeader
        title={dict.admin?.receiveStock || 'Receive Stock'}
        subtitle={`${purchaseOrder.orderNumber}${purchaseOrder.supplier?.name ? ` — ${purchaseOrder.supplier.name}` : ''}`}
        onClose={onClose}
        dict={dict}
      />
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <p className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict.admin?.poReceiveHint || 'Enter how many units of each item arrived in this delivery. Stock is increased by that amount.'}
          </p>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left text-xs font-medium text-gray-500">{dict.admin?.product || 'Product'}</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict.admin?.ordered || 'Ordered'}</th>
                <th className="pb-2 text-right text-xs font-medium text-gray-500">{dict.admin?.alreadyReceived || 'Received'}</th>
                <th className="pb-2 pl-3 text-right text-xs font-medium text-gray-500">{dict.admin?.receivingNow || 'Receiving now'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {purchaseOrder.items.map((item) => {
                const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                const name = item.product?.name || item.productId;
                return (
                  <tr key={item._id}>
                    <td className="py-2 text-gray-900">
                      {name}
                      {item.product?.sku && <span className="block text-xs font-mono text-gray-400">{item.product.sku}</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">{item.quantityOrdered}</td>
                    <td className="py-2 text-right tabular-nums text-gray-700">{item.quantityReceived}</td>
                    <td className="py-2 pl-3 text-right">
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        disabled={remaining === 0}
                        aria-label={`${dict.admin?.receivingNow || 'Receiving now'}: ${name}`}
                        value={incoming[item._id] ?? 0}
                        onChange={(e) =>
                          setIncoming((prev) => ({
                            ...prev,
                            [item._id]: Math.min(remaining, Math.max(0, parseInt(e.target.value) || 0)),
                          }))
                        }
                        className="w-24 border border-gray-300 px-2 py-2 text-sm text-right tabular-nums disabled:bg-gray-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors">
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting || totalIncoming === 0}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? (dict.common?.saving || 'Saving…') : (dict.admin?.confirmReceipt || 'Confirm Receipt')}
          </button>
        </div>
      </form>
    </>
  );
}
