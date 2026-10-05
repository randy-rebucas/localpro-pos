'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import FormattedDate from '@/components/FormattedDate';
import { usePermissions } from '@/hooks/usePermissions';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';

interface Transaction {
  _id: string;
  receiptNumber?: string;
  items: Array<{
    product: string | { name: string };
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital' | 'tap_to_pay' | 'wallet' | 'qr_code' | 'bnpl' | 'on_account';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  userId?: string | { name: string; email: string };
  notes?: string;
  createdAt: string;
}

const PAGE_SIZE = 10;

const STATUS_BADGE: Record<string, string> = {
  completed: 'bg-win8-success text-white',
  refunded: 'bg-win8-suspended text-white',
  cancelled: 'bg-win8-danger text-white',
};

function getPaymentMethodLabel(method: Transaction['paymentMethod'], dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<Transaction['paymentMethod'], string> = {
    cash: dict.admin?.cash || dict.pos?.cash || 'Cash',
    card: dict.admin?.card || dict.pos?.card || 'Card',
    digital: dict.admin?.digital || dict.pos?.digital || 'Digital',
    tap_to_pay: dict.pos?.tapToPay || 'Tap to Pay',
    wallet: dict.pos?.wallet || 'Wallet',
    qr_code: dict.pos?.qrCode || 'QR Code',
    bnpl: dict.pos?.bnpl || 'BNPL',
    on_account: dict.pos?.onAccount || 'On account',
  };
  return labels[method] || method;
}

function getStatusLabel(status: Transaction['status'], dict: any): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  const labels: Record<Transaction['status'], string> = {
    completed: dict.transactions?.completed || dict.admin?.completed || 'completed',
    cancelled: dict.transactions?.cancelled || dict.admin?.cancelled || 'cancelled',
    refunded: dict.transactions?.refunded || 'refunded',
  };
  return labels[status] || status;
}

function StatusBadge({ status, dict }: { status: Transaction['status']; dict: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[status] || 'bg-gray-500 text-white'}`}>
      {getStatusLabel(status, dict)}
    </span>
  );
}

export default function TransactionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { canAccess } = usePermissions();
  const canView = canAccess('transactions.view');

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?page=${page}&limit=${PAGE_SIZE}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total ?? (data.data || []).length);
        setError(null);
      } else {
        setError(data.error || dict?.common?.failedToFetchTransactions || 'Failed to fetch transactions');
        setTransactions([]);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(dict?.common?.failedToFetchTransactions || 'Failed to fetch transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setDetailOpen(true);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="p-4 bg-white border border-win8-danger">
          <h2 className="text-base font-bold text-win8-danger mb-1">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
          <p className="text-sm text-gray-700">
            {dict.admin?.accessRestrictedTransactions || "You don't have permission to view transactions. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingTransactions || 'Loading transactions…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            onClick={() => fetchTransactions()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (transactions.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {dict.admin?.noTransactionsYet || 'No transactions yet.'}
        </div>
      );
    }

    return (
      <div className="border border-gray-300 bg-white">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.receiptNumber || 'Receipt #'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.transactions?.date || dict.admin?.date || 'Date'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.transactions?.items || 'Items'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.subtotal || 'Subtotal'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.discount || 'Discount'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.total || 'Total'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.transactions?.payment || 'Payment'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.status || 'Status'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((transaction) => {
                const viewLabel = dict.common?.view || 'View';
                const receipt = transaction.receiptNumber || '—';
                return (
                  <tr
                    key={transaction._id}
                    className={`hover:bg-gray-100 transition-colors ${detailOpen && selectedTransaction?._id === transaction._id ? 'bg-brand-soft' : ''}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-900">{receipt}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">
                      <FormattedDate date={transaction.createdAt} includeTime={true} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700 tabular-nums">
                      {transaction.items.length.toLocaleString()} {transaction.items.length === 1 ? (dict.transactions?.item || 'item') : (dict.transactions?.items || 'items')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-900">
                      <Currency amount={transaction.subtotal} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                      {transaction.discountAmount ? (
                        <>
                          <p className="text-win8-danger">-<Currency amount={transaction.discountAmount} /></p>
                          {transaction.discountCode && (
                            <p className="text-xs text-gray-400 font-mono">{transaction.discountCode}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                      <Currency amount={transaction.total} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 text-xs font-semibold bg-brand-navy text-white">
                        {getPaymentMethodLabel(transaction.paymentMethod, dict)}
                      </span>
                      {transaction.paymentMethod === 'cash' && transaction.change !== undefined && (
                        <p className="text-xs text-gray-500 mt-1 tabular-nums">
                          {dict.transactions?.change || dict.admin?.change || 'Change'}: <Currency amount={transaction.change} />
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={transaction.status} dict={dict} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openDetail(transaction)}
                          title={viewLabel}
                          aria-label={`${viewLabel} ${receipt}`}
                          className="inline-flex items-center justify-center p-2.5 text-white bg-brand hover:brightness-110 transition-[filter]"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {dict.admin?.showing || 'Showing'} {start.toLocaleString()}–{end.toLocaleString()} {dict.admin?.of || 'of'} {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.transactions?.previous || dict.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict.transactions?.next || dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.transactions || 'Transactions'}
          description={dict.admin?.transactionsSubtitle || 'View and manage all sales transactions'}
        />
        <div className="space-y-4">
          {renderBody()}
        </div>
      </div>

      <TransactionDetailDrawer
        open={detailOpen}
        transaction={selectedTransaction}
        onClose={() => setDetailOpen(false)}
        dict={dict}
      />
    </>
  );
}

function TransactionDetailDrawer({
  open,
  transaction,
  onClose,
  dict,
}: {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const closeLabel = dict.common?.close || 'Close';

  return (
    <Win8Drawer open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{dict.admin?.transactionDetails || 'Transaction Details'}</h2>
          {transaction?.receiptNumber && (
            <p className="text-xs text-white/70 font-mono truncate">{transaction.receiptNumber}</p>
          )}
        </div>
        <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {transaction && (
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-medium text-gray-600 mb-1">{dict.admin?.receiptNumber || 'Receipt #'}</dt>
              <dd className="text-sm font-mono text-gray-900">{transaction.receiptNumber || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-600 mb-1">{dict.transactions?.date || dict.admin?.date || 'Date'}</dt>
              <dd className="text-sm text-gray-900"><FormattedDate date={transaction.createdAt} includeTime={true} /></dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-600 mb-1">{dict.admin?.status || 'Status'}</dt>
              <dd><StatusBadge status={transaction.status} dict={dict} /></dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-600 mb-1">{dict.transactions?.payment || 'Payment'}</dt>
              <dd>
                <span className="px-2 py-0.5 text-xs font-semibold bg-brand-navy text-white">
                  {getPaymentMethodLabel(transaction.paymentMethod, dict)}
                </span>
              </dd>
            </div>
          </dl>

          <hr className="border-gray-300" />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{dict.transactions?.items || 'Items'}</p>
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-200">
                {transaction.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500 tabular-nums">
                        {dict.transactions?.qty || 'Qty'}: {item.quantity.toLocaleString()} × <Currency amount={item.price} />
                      </p>
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                      <Currency amount={item.subtotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-300 pt-3 space-y-2 text-sm tabular-nums">
            <div className="flex justify-between">
              <span className="text-gray-600">{dict.admin?.subtotal || 'Subtotal'}</span>
              <span className="font-medium text-gray-900"><Currency amount={transaction.subtotal} /></span>
            </div>
            {transaction.discountAmount ? (
              <div className="flex justify-between text-win8-danger">
                <span>
                  {dict.transactions?.discountLabel || dict.admin?.discount || 'Discount'}
                  {transaction.discountCode && <span className="font-mono text-xs"> ({transaction.discountCode})</span>}
                </span>
                <span>-<Currency amount={transaction.discountAmount} /></span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
              <span>{dict.common?.total || 'Total'}</span>
              <span><Currency amount={transaction.total} /></span>
            </div>
            {transaction.paymentMethod === 'cash' && transaction.cashReceived ? (
              <div className="flex justify-between text-xs text-gray-500">
                <span>{dict.transactions?.cashReceived || 'Cash Received'}</span>
                <span><Currency amount={transaction.cashReceived} /></span>
              </div>
            ) : null}
            {transaction.paymentMethod === 'cash' && transaction.change !== undefined && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>{dict.transactions?.change || 'Change'}</span>
                <span><Currency amount={transaction.change} /></span>
              </div>
            )}
          </div>

          {transaction.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{dict.common?.notes || 'Notes'}</p>
              <div className="p-3 bg-gray-100 border border-gray-300 text-sm text-gray-700 whitespace-pre-wrap">{transaction.notes}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0 mt-auto">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
        >
          {closeLabel}
        </button>
      </div>
    </Win8Drawer>
  );
}
