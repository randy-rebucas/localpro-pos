'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
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

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

const btnPrimary =
  'px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors';
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors';
const btnRowIcon =
  'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const thCls = 'px-4 py-3 text-left font-medium';
const thRight = 'px-4 py-3 text-right font-medium';

const ICON = {
  send: 'M6 12 3.27 3.13a59.77 59.77 0 0 1 17.73 8.87 59.77 59.77 0 0 1-17.73 8.88L6 12Zm0 0h7.5',
  receive: 'm5 12 5 5L20 7',
  cancel: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  delete: 'M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z',
  close: 'M6 18 18 6M6 6l12 12',
};

function Icon({ d, className = 'w-4 h-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/** Dictionary lookup under `stockTransfers`, with an English fallback. */
function tr(dict: Dict, key: string, fallback: string): string {
  return dict?.stockTransfers?.[key] || fallback;
}

function DrawerHeader({ title, subtitle, onClose, closeLabel }: { title: string; subtitle?: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
      <div className="min-w-0">
        <h2 className="text-base font-semibold truncate">{title}</h2>
        {subtitle && <p className="text-xs text-white/70 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
        <Icon d={ICON.close} className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function StockTransfersPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { canAccess } = usePermissions();
  const allowCreate = canAccess('stock_transfers.create');
  // Cancelling is a status update (PUT /api/stock-transfers/[id]).
  const allowEdit = canAccess('stock_transfers.edit');
  const allowDelete = canAccess('stock_transfers.delete');
  const allowSend = canAccess('stock_transfers.send');
  const allowReceive = canAccess('stock_transfers.receive');
  const showRowActions = allowEdit || allowDelete || allowSend || allowReceive;

  const {
    stockTransfers,
    loading,
    fetchError,
    fetchStockTransfers,
    createStockTransfer,
    updateStockTransferStatus,
    deleteStockTransfer,
    sendStockTransfer,
    receiveItems,
    clearMessage,
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

  const t = (key: string, fallback: string) => tr(dict, key, fallback);

  // Row actions report through toasts with localized text; the hook's own `message` is English-only.
  const runRowAction = async (transfer: StockTransfer, action: () => Promise<true | string | boolean>, successText: string) => {
    setBusyId(transfer._id);
    const result = await action();
    clearMessage();
    setBusyId(null);
    if (result === true) {
      showToast.success(successText);
      await fetchStockTransfers();
    } else {
      showToast.error(typeof result === 'string' ? result : t('actionFailed', 'Action failed. Please try again.'));
    }
  };

  const handleSend = (transfer: StockTransfer) => {
    const msg = t('confirmSend', 'Send transfer "{number}"? Stock will be deducted from {from}.')
      .replace('{number}', transfer.transferNumber)
      .replace('{from}', transfer.fromBranch?.name || t('sourceBranch', 'the source branch'));
    if (!confirm(msg)) return;
    runRowAction(transfer, () => sendStockTransfer(transfer._id), t('sentSuccess', 'Stock transfer marked as sent'));
  };

  const handleCancel = (transfer: StockTransfer) => {
    const msg = t('confirmCancel', 'Cancel transfer "{number}"? This cannot be undone.').replace('{number}', transfer.transferNumber);
    if (!confirm(msg)) return;
    runRowAction(transfer, () => updateStockTransferStatus(transfer._id, 'cancelled'), t('cancelledSuccess', 'Stock transfer cancelled'));
  };

  const handleDelete = (transfer: StockTransfer) => {
    const msg = t('confirmDelete', 'Delete draft transfer "{number}"?').replace('{number}', transfer.transferNumber);
    if (!confirm(msg)) return;
    runRowAction(transfer, () => deleteStockTransfer(transfer._id), t('deletedSuccess', 'Stock transfer deleted'));
  };

  const openReceive = (transfer: StockTransfer) => {
    clearMessage();
    setReceivingTransfer(transfer);
    setShowReceive(true);
  };

  if (!dict) {
    return <div className="flex items-center justify-center py-24">{SPINNER}</div>;
  }

  const tooFewBranches = branches.length < 2;

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{t('loading', 'Loading stock transfers…')}</p>
        </div>
      );
    }

    if (fetchError) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300" role="alert">
          <p className="text-win8-danger text-sm font-medium">{fetchError}</p>
          <button onClick={fetchStockTransfers} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (stockTransfers.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {t('noTransfersYet', 'No stock transfers yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className={thCls}>{t('transferNumber', 'Transfer #')}</th>
              <th className={thCls}>{t('from', 'From')}</th>
              <th className={thCls}>{t('to', 'To')}</th>
              <th className={thRight}>{t('items', 'Items')}</th>
              <th className={thCls}>{t('created', 'Created')}</th>
              <th className={thCls}>{t('status', 'Status')}</th>
              {showRowActions && <th className={thRight}>{dict.common?.actions || 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stockTransfers.map((transfer) => {
              const busy = busyId === transfer._id;
              const canSend = allowSend && transfer.status === 'pending';
              const canReceive = allowReceive && (transfer.status === 'in_transit' || transfer.status === 'partially_received');
              const canCancel = allowEdit && isStockTransferStatusEditable(transfer.status) && getAllowedNextStatuses(transfer.status).includes('cancelled');
              const canDelete = allowDelete && transfer.status === 'pending';
              return (
                <tr key={transfer._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-gray-900">{transfer.transferNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{transfer.fromBranch?.name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-900">{transfer.toBranch?.name || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">{transfer.items.length.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatStockTransferDate(transfer.createdAt, lang)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${getStatusColor(transfer.status)}`}>
                      {getStatusLabel(transfer.status, dict)}
                    </span>
                  </td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {busy ? (
                          <span className="inline-flex items-center justify-center p-2.5 text-brand">{SPINNER_SM}</span>
                        ) : (
                          <>
                            {canSend && (
                              <button type="button" onClick={() => handleSend(transfer)} title={t('send', 'Send')} aria-label={`${t('send', 'Send')} ${transfer.transferNumber}`} className={`${btnRowIcon} bg-brand`}>
                                <Icon d={ICON.send} />
                              </button>
                            )}
                            {canReceive && (
                              <button type="button" onClick={() => openReceive(transfer)} title={t('receive', 'Receive')} aria-label={`${t('receive', 'Receive')} ${transfer.transferNumber}`} className={`${btnRowIcon} bg-win8-success`}>
                                <Icon d={ICON.receive} />
                              </button>
                            )}
                            {canCancel && (
                              <button type="button" onClick={() => handleCancel(transfer)} title={t('cancelTransfer', 'Cancel transfer')} aria-label={`${t('cancelTransfer', 'Cancel transfer')} ${transfer.transferNumber}`} className={`${btnRowIcon} bg-win8-danger`}>
                                <Icon d={ICON.cancel} />
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" onClick={() => handleDelete(transfer)} title={dict.common?.delete || 'Delete'} aria-label={`${dict.common?.delete || 'Delete'} ${transfer.transferNumber}`} className={`${btnRowIcon} bg-win8-danger`}>
                                <Icon d={ICON.delete} />
                              </button>
                            )}
                          </>
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
          title={t('title', 'Stock Transfers')}
          description={t('subtitle', 'Move inventory between branches with a full audit trail')}
          actions={allowCreate ? (
            <button
              type="button"
              onClick={() => {
                clearMessage();
                setCreateKey((k) => k + 1);
                setShowCreate(true);
              }}
              disabled={tooFewBranches}
              title={tooFewBranches ? t('needTwoBranches', 'You need at least 2 branches to transfer stock.') : undefined}
              className={btnPrimary}
            >
              + {t('newTransfer', 'New Transfer')}
            </button>
          ) : undefined}
        />

        <div className="space-y-4">
          {allowCreate && tooFewBranches && !loading && (
            <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
              {t('needTwoBranches', 'You need at least 2 branches to transfer stock.')}
            </div>
          )}
          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showCreate} onClose={() => setShowCreate(false)} widthClass="max-w-2xl">
        <CreateStockTransferForm
          key={createKey}
          dict={dict}
          branches={branches}
          products={products}
          onClose={() => setShowCreate(false)}
          onSave={async () => {
            clearMessage();
            showToast.success(t('createdSuccess', 'Stock transfer created'));
            setShowCreate(false);
            await fetchStockTransfers();
          }}
          createStockTransfer={createStockTransfer}
        />
      </Win8Drawer>

      <Win8Drawer open={showReceive} onClose={() => setShowReceive(false)} widthClass="max-w-2xl">
        {receivingTransfer && (
          <ReceiveForm
            key={receivingTransfer._id}
            dict={dict}
            stockTransfer={receivingTransfer}
            onClose={() => setShowReceive(false)}
            onSave={async () => {
              clearMessage();
              showToast.success(t('receivedSuccess', 'Stock received'));
              setShowReceive(false);
              await fetchStockTransfers();
            }}
            receiveItems={receiveItems}
          />
        )}
      </Win8Drawer>
    </>
  );
}

function CreateStockTransferForm({
  dict,
  branches,
  products,
  onClose,
  onSave,
  createStockTransfer,
}: {
  dict: Dict;
  branches: { _id: string; name: string }[];
  products: { _id: string; name: string; sku?: string }[];
  onClose: () => void;
  onSave: () => Promise<void>;
  createStockTransfer: (form: { fromBranchId: string; toBranchId: string; notes?: string; items: StockTransferItemInput[] }) => Promise<true | string>;
}) {
  const t = (key: string, fallback: string) => tr(dict, key, fallback);
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
      setError(t('bothBranchesRequired', 'Both branches are required'));
      return;
    }
    if (fromBranchId === toBranchId) {
      setError(t('differentBranches', 'Source and destination branch must be different'));
      return;
    }
    if (validLines.length === 0) {
      setError(t('addAtLeastOneItem', 'Add at least one item'));
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

  const closeLabel = dict?.common?.close || 'Close';

  return (
    <>
      <DrawerHeader title={t('newStockTransfer', 'New Stock Transfer')} onClose={onClose} closeLabel={closeLabel} />
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="st-from" className={labelCls}>
                {t('fromBranch', 'From Branch')} <span className="text-win8-danger">*</span>
              </label>
              <select id="st-from" required value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)} className={inputCls}>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="st-to" className={labelCls}>
                {t('toBranch', 'To Branch')} <span className="text-win8-danger">*</span>
              </label>
              <select id="st-to" required value={toBranchId} onChange={(e) => setToBranchId(e.target.value)} className={inputCls}>
                {branches.map((b) => (
                  <option key={b._id} value={b._id} disabled={b._id === fromBranchId}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="st-notes" className={labelCls}>{t('notes', 'Notes')}</label>
            <textarea id="st-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>

          <hr className="border-gray-300" />

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {t('items', 'Items')} <span className="text-win8-danger">*</span>
              </p>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { productId: '', quantityRequested: 1 }])}
                className="px-3 py-1 text-xs font-semibold bg-brand text-white hover:brightness-110 transition-[filter]"
              >
                + {t('addLine', 'Add line')}
              </button>
            </div>
            <div className="border border-gray-300 divide-y divide-gray-200">
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-white">
                  <select
                    value={line.productId}
                    onChange={(e) => updateLine(index, { productId: e.target.value })}
                    aria-label={`${t('product', 'Product')} ${index + 1}`}
                    className="flex-1 min-w-0 border border-gray-300 px-2 py-2 text-sm bg-white"
                  >
                    <option value="">{t('selectProduct', 'Select product…')}</option>
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
                    placeholder={t('qty', 'Qty')}
                    aria-label={`${t('quantity', 'Quantity')} ${index + 1}`}
                    className="w-24 border border-gray-300 px-2 py-2 text-sm text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                    title={t('removeLine', 'Remove line')}
                    aria-label={`${t('removeLine', 'Remove line')} ${index + 1}`}
                    className="inline-flex items-center justify-center p-2 text-win8-danger hover:bg-gray-100 disabled:opacity-30 transition-colors"
                  >
                    <Icon d={ICON.close} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className={btnPrimary}>
            {submitting ? (dict?.common?.saving || 'Saving…') : t('createTransfer', 'Create Transfer')}
          </button>
        </div>
      </form>
    </>
  );
}

function ReceiveForm({
  dict,
  stockTransfer,
  onClose,
  onSave,
  receiveItems,
}: {
  dict: Dict;
  stockTransfer: StockTransfer;
  onClose: () => void;
  onSave: () => Promise<void>;
  receiveItems: (id: string, items: { itemId: string; quantityReceived: number }[]) => Promise<true | string>;
}) {
  const t = (key: string, fallback: string) => tr(dict, key, fallback);
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
    <>
      <DrawerHeader
        title={t('receiveTitle', 'Receive Stock Transfer')}
        subtitle={`${stockTransfer.transferNumber} · ${stockTransfer.fromBranch?.name || '—'} → ${stockTransfer.toBranch?.name || '—'}`}
        onClose={onClose}
        closeLabel={dict?.common?.close || 'Close'}
      />
      <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {t('receiveHint', 'Enter the quantity that actually arrived for each item. Anything less than sent is recorded as a partial receipt.')}
          </div>
          <div className="border border-gray-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('product', 'Product')}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{t('sent', 'Sent')}</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{t('received', 'Received')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stockTransfer.items.map((item) => (
                  <tr key={item._id}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{item.product?.name || item.productId}</p>
                      {item.product?.sku && <p className="text-xs text-gray-400 font-mono">{item.product.sku}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{item.quantitySent.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={item.quantitySent}
                        value={quantities[item._id]}
                        aria-label={`${t('received', 'Received')}: ${item.product?.name || item.productId}`}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [item._id]: Math.min(item.quantitySent, Math.max(0, parseInt(e.target.value) || 0)) }))
                        }
                        className="w-24 border border-gray-300 px-2 py-1.5 text-sm text-right tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className={btnPrimary}>
            {submitting ? (dict?.common?.saving || 'Saving…') : t('confirmReceipt', 'Confirm Receipt')}
          </button>
        </div>
      </form>
    </>
  );
}
