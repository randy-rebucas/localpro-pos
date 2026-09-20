'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { useBranchesList } from '@/hooks/useBranchesList';
import { useProductsList } from '@/hooks/useProductsList';
import {
  useStockTransferList,
  type StockTransfer,
  type StockTransferItemInput,
} from '@/hooks/useStockTransferList';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getStatusColor,
  getStatusLabel,
  getAllowedNextStatuses,
  isStockTransferStatusEditable,
  formatStockTransferDate,
} from '@/lib/stock-transfer-helpers';

export default function StockTransfersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('stock_transfers.manage');

  const {
    stockTransfers,
    loading,
    message,
    fetchStockTransfers,
    createStockTransfer,
    updateStockTransferStatus,
    deleteStockTransfer,
    sendStockTransfer,
    receiveItems,
    clearMessage,
    setMessage,
  } = useStockTransferList();

  const { branches, fetchBranches } = useBranchesList();
  const { products, fetchProducts } = useProductsList(tenant);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchStockTransfers();
    fetchBranches();
    fetchProducts({ limit: 500, isActive: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleCancel = async (transfer: StockTransfer) => {
    const success = await updateStockTransferStatus(transfer._id, 'cancelled');
    if (success === true) await fetchStockTransfers();
  };

  const handleSend = async (transfer: StockTransfer) => {
    const success = await sendStockTransfer(transfer._id);
    if (success === true) await fetchStockTransfers();
  };

  const handleDelete = async (transfer: StockTransfer) => {
    if (!confirm(`Delete draft transfer "${transfer.transferNumber}"?`)) return;
    const success = await deleteStockTransfer(transfer._id);
    if (success) await fetchStockTransfers();
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Stock Transfers</h1>
          <p className="text-gray-600">Move inventory between branches with a full audit trail</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Stock Transfers</h2>
            {canManage && (
              <button
                onClick={() => {
                  clearMessage();
                  setShowCreateModal(true);
                }}
                disabled={branches.length < 2}
                className="px-4 py-2 bg-brand text-white hover:bg-brand-hover disabled:opacity-50 font-medium border border-brand-hover"
                title={branches.length < 2 ? 'Need at least 2 branches' : undefined}
              >
                New Transfer
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stockTransfers.map((transfer) => (
                  <tr key={transfer._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-gray-900">{transfer.transferNumber}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{transfer.fromBranch?.name || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{transfer.toBranch?.name || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{transfer.items.length}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{formatStockTransferDate(transfer.createdAt)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(transfer.status)}`}>
                        {getStatusLabel(transfer.status, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      {canManage ? (
                        <div className="flex gap-2 flex-wrap">
                          {transfer.status === 'pending' && (
                            <button onClick={() => handleSend(transfer)} className="text-brand hover:text-brand-navy-deep">
                              Send
                            </button>
                          )}
                          {(transfer.status === 'in_transit' || transfer.status === 'partially_received') && (
                            <button onClick={() => setReceivingTransfer(transfer)} className="text-brand hover:text-brand-navy-deep">
                              Receive
                            </button>
                          )}
                          {isStockTransferStatusEditable(transfer.status) && getAllowedNextStatuses(transfer.status).includes('cancelled') && (
                            <button onClick={() => handleCancel(transfer)} className="text-red-600 hover:text-red-900">
                              Cancel
                            </button>
                          )}
                          {transfer.status === 'pending' && (
                            <button onClick={() => handleDelete(transfer)} className="text-red-600 hover:text-red-900">
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
            {stockTransfers.length === 0 && (
              <div className="text-center py-8 text-gray-500">No stock transfers found</div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <CreateStockTransferModal
            branches={branches}
            products={products}
            onClose={() => setShowCreateModal(false)}
            onSave={async () => {
              setMessage({ type: 'success', text: 'Stock transfer created successfully' });
              await fetchStockTransfers();
              setShowCreateModal(false);
            }}
            createStockTransfer={createStockTransfer}
          />
        )}

        {receivingTransfer && (
          <ReceiveModal
            stockTransfer={receivingTransfer}
            onClose={() => setReceivingTransfer(null)}
            onSave={async () => {
              setMessage({ type: 'success', text: 'Stock received successfully' });
              await fetchStockTransfers();
              setReceivingTransfer(null);
            }}
            receiveItems={receiveItems}
          />
        )}
      </div>
    </div>
  );
}

function CreateStockTransferModal({
  branches,
  products,
  onClose,
  onSave,
  createStockTransfer,
}: {
  branches: { _id: string; name: string }[];
  products: { _id: string; name: string; sku?: string }[];
  onClose: () => void;
  onSave: () => Promise<void>;
  createStockTransfer: (form: { fromBranchId: string; toBranchId: string; notes?: string; items: StockTransferItemInput[] }) => Promise<true | string>;
}) {
  const [fromBranchId, setFromBranchId] = useState(branches[0]?._id || '');
  const [toBranchId, setToBranchId] = useState(branches[1]?._id || branches[0]?._id || '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockTransferItemInput[]>([{ productId: '', quantityRequested: 1 }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (index: number, patch: Partial<StockTransferItemInput>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validLines = lines.filter((line) => line.productId && line.quantityRequested > 0);
    if (!fromBranchId || !toBranchId) {
      setError('Both branches are required');
      return;
    }
    if (fromBranchId === toBranchId) {
      setError('Source and destination branch must be different');
      return;
    }
    if (validLines.length === 0) {
      setError('Add at least one item');
      return;
    }
    setSubmitting(true);
    const result = await createStockTransfer({ fromBranchId, toBranchId, notes: notes || undefined, items: validLines });
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">New Stock Transfer</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Branch *</label>
                <select
                  required
                  value={fromBranchId}
                  onChange={(e) => setFromBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                >
                  {branches.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Branch *</label>
                <select
                  required
                  value={toBranchId}
                  onChange={(e) => setToBranchId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                >
                  {branches.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}</option>
                  ))}
                </select>
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
                  onClick={() => setLines((prev) => [...prev, { productId: '', quantityRequested: 1 }])}
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
                      className="col-span-8 px-2 py-2 border border-gray-300 bg-white text-sm"
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
                      value={line.quantityRequested}
                      onChange={(e) => updateLine(index, { quantityRequested: parseInt(e.target.value) || 1 })}
                      placeholder="Qty"
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
                {submitting ? 'Saving...' : 'Create Transfer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({
  stockTransfer,
  onClose,
  onSave,
  receiveItems,
}: {
  stockTransfer: StockTransfer;
  onClose: () => void;
  onSave: () => Promise<void>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(stockTransfer.items.map((item) => [item._id, item.quantitySent]))
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await receiveItems(
      stockTransfer._id,
      stockTransfer.items.map((item) => ({ itemId: item._id, quantityReceived: quantities[item._id] ?? item.quantityReceived }))
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
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Receive Stock Transfer</h2>
          <p className="text-sm text-gray-600 mb-4">
            {stockTransfer.transferNumber} &mdash; {stockTransfer.fromBranch?.name} &rarr; {stockTransfer.toBranch?.name}
          </p>
          <form onSubmit={onSubmit} className="space-y-3">
            {stockTransfer.items.map((item) => (
              <div key={item._id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6 text-sm text-gray-900">
                  {item.product?.name || item.productId}
                  {item.product?.sku && <span className="text-gray-500"> ({item.product.sku})</span>}
                </div>
                <div className="col-span-3 text-sm text-gray-500">Sent: {item.quantitySent}</div>
                <input
                  type="number"
                  min="0"
                  max={item.quantitySent}
                  value={quantities[item._id]}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [item._id]: Math.min(item.quantitySent, Math.max(0, parseInt(e.target.value) || 0)) }))
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
