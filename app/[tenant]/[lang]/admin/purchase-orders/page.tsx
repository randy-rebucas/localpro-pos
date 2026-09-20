'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useSupplierList } from '@/hooks/useSupplierList';
import { useProductsList } from '@/hooks/useProductsList';
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

export default function PurchaseOrdersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('purchase_orders.manage');

  const {
    purchaseOrders,
    loading,
    message,
    fetchPurchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrderStatus,
    deletePurchaseOrder,
    receiveItems,
    clearMessage,
    setMessage,
  } = usePurchaseOrderList();

  const { suppliers, fetchSuppliers } = useSupplierList();
  const { products, fetchProducts } = useProductsList(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchPurchaseOrders();
    fetchSuppliers();
    fetchProducts({ limit: 500, isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleStatusChange = async (po: PurchaseOrder, status: PurchaseOrderStatus) => {
    const success = await updatePurchaseOrderStatus(po._id, status);
    if (success === true) await fetchPurchaseOrders();
  };

  const handleDelete = async (po: PurchaseOrder) => {
    if (!confirm(`Delete draft purchase order "${po.orderNumber}"?`)) return;
    const success = await deletePurchaseOrder(po._id);
    if (success) await fetchPurchaseOrders();
  };

  if (!dict || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Purchase Orders</h1>
          <p className="text-gray-600">Order stock from suppliers and receive it into inventory</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Purchase Orders</h2>
            {canManage && (
              <button
                onClick={() => {
                  clearMessage();
                  setShowCreateModal(true);
                }}
                disabled={suppliers.length === 0}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 font-medium border border-brand-hover"
                title={suppliers.length === 0 ? 'Add a supplier first' : undefined}
              >
                New Purchase Order
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchaseOrders.map((po) => (
                  <tr key={po._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">{po.orderNumber}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{po.supplier?.name || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{po.items.length}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      <Currency amount={po.totalAmount} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {po.expectedDate ? formatPurchaseOrderDate(po.expectedDate) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(po.status)}`}>
                        {getStatusLabel(po.status, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      {canManage ? (
                        <div className="flex gap-2 flex-wrap">
                          {(po.status === 'ordered' || po.status === 'partially_received') && (
                            <button onClick={() => setReceivingOrder(po)} className="text-brand hover:text-brand-navy-deep">
                              Receive
                            </button>
                          )}
                          {po.status === 'draft' && (
                            <button onClick={() => handleStatusChange(po, 'ordered')} className="text-brand hover:text-brand-navy-deep">
                              Mark Ordered
                            </button>
                          )}
                          {isPurchaseOrderStatusEditable(po.status) && getAllowedNextStatuses(po.status).includes('cancelled') && (
                            <button onClick={() => handleStatusChange(po, 'cancelled')} className="text-red-600 hover:text-red-900">
                              Cancel
                            </button>
                          )}
                          {po.status === 'draft' && (
                            <button onClick={() => handleDelete(po)} className="text-red-600 hover:text-red-900">
                              Delete
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {purchaseOrders.length === 0 && (
              <div className="text-center py-8 text-gray-500">No purchase orders found</div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <CreatePurchaseOrderModal
            suppliers={suppliers}
            products={products}
            onClose={() => setShowCreateModal(false)}
            onSave={async () => {
              setMessage({ type: 'success', text: 'Purchase order created successfully' });
              await fetchPurchaseOrders();
              setShowCreateModal(false);
            }}
            createPurchaseOrder={createPurchaseOrder}
          />
        )}

        {receivingOrder && (
          <ReceiveModal
            purchaseOrder={receivingOrder}
            onClose={() => setReceivingOrder(null)}
            onSave={async () => {
              setMessage({ type: 'success', text: 'Stock received successfully' });
              await fetchPurchaseOrders();
              setReceivingOrder(null);
            }}
            receiveItems={receiveItems}
          />
        )}
      </div>
    </div>
  );
}

function CreatePurchaseOrderModal({
  suppliers,
  products,
  onClose,
  onSave,
  createPurchaseOrder,
}: {
  suppliers: { _id: string; name: string }[];
  products: { _id: string; name: string; sku?: string }[];
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
      setError('Supplier is required');
      return;
    }
    if (validLines.length === 0) {
      setError('Add at least one item');
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

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">New Purchase Order</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                >
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">Items *</label>
                <button
                  type="button"
                  onClick={() => setLines((prev) => [...prev, { productId: '', quantityOrdered: 1, unitCost: 0 }])}
                  className="text-sm text-brand hover:text-brand-navy-deep"
                >
                  + Add line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(index, { productId: e.target.value })}
                      className="col-span-6 px-2 py-2 border border-gray-300 bg-white text-sm"
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={line.quantityOrdered}
                      onChange={(e) => updateLine(index, { quantityOrdered: parseInt(e.target.value) || 1 })}
                      placeholder="Qty"
                      className="col-span-2 px-2 py-2 border border-gray-300 text-sm"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) => updateLine(index, { unitCost: parseFloat(e.target.value) || 0 })}
                      placeholder="Unit cost"
                      className="col-span-3 px-2 py-2 border border-gray-300 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="col-span-1 text-red-600 hover:text-red-900 disabled:opacity-30 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-right mt-2 text-sm font-semibold text-gray-900">
                Total: <Currency amount={total} />
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-800 border border-red-300 p-3">{error}</div>}
            <div className="flex gap-3 justify-end pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? 'Saving...' : 'Create Purchase Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({
  purchaseOrder,
  onClose,
  onSave,
  receiveItems,
}: {
  purchaseOrder: PurchaseOrder;
  onClose: () => void;
  onSave: () => Promise<void>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(purchaseOrder.items.map((item) => [item._id, item.quantityOrdered]))
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await receiveItems(
      purchaseOrder._id,
      purchaseOrder.items.map((item) => ({ itemId: item._id, quantityReceived: quantities[item._id] ?? item.quantityReceived }))
    );
    setSubmitting(false);
    if (result === true) {
      await onSave();
    } else {
      setError(result);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Receive Stock</h2>
          <p className="text-sm text-gray-600 mb-4">{purchaseOrder.orderNumber} &mdash; {purchaseOrder.supplier?.name}</p>
          <form onSubmit={onSubmit} className="space-y-3">
            {purchaseOrder.items.map((item) => (
              <div key={item._id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6 text-sm text-gray-900">
                  {item.product?.name || item.productId}
                  {item.product?.sku && <span className="text-gray-500"> ({item.product.sku})</span>}
                </div>
                <div className="col-span-3 text-sm text-gray-500">Ordered: {item.quantityOrdered}</div>
                <input
                  type="number"
                  min="0"
                  max={item.quantityOrdered}
                  value={quantities[item._id]}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [item._id]: Math.min(item.quantityOrdered, Math.max(0, parseInt(e.target.value) || 0)) }))
                  }
                  className="col-span-3 px-2 py-2 border border-gray-300 text-sm"
                />
              </div>
            ))}
            {error && <div className="bg-red-50 text-red-800 border border-red-300 p-3">{error}</div>}
            <div className="flex gap-3 justify-end pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 border border-brand-hover"
              >
                {submitting ? 'Saving...' : 'Confirm Receipt'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
