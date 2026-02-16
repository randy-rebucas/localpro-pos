'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

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
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  userId?: string | { name: string; email: string };
  notes?: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchTransactions();
  }, [lang, tenant, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?page=${page}&limit=50`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
        setTotalPages(data.pagination?.pages || 1);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchTransactions || 'Failed to fetch transactions' });
        setTransactions([]);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToFetchTransactions || 'Failed to fetch transactions' });
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.transactions || 'Transactions'}
              </h1>
              <p className="text-gray-600">{dict.admin?.transactionsSubtitle || 'View and manage all sales transactions'}</p>
            </div>
            <button
              onClick={() => router.push(`/${tenant}/${lang}/admin`)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              {dict.common?.back || 'Back'}
            </button>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.receiptNumber || 'Receipt #'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.transactions?.date || dict.admin?.date || 'Date'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.transactions?.items || 'Items'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.subtotal || 'Subtotal'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.discount || 'Discount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.total || 'Total'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.transactions?.payment || 'Payment'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.status || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((transaction) => (
                  <tr key={transaction._id}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {transaction.receiptNumber || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {transaction.items.length} {transaction.items.length === 1 ? (dict.transactions?.item || 'item') : (dict.transactions?.items || 'items')}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      <Currency amount={transaction.subtotal} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.discountAmount ? (
                        <div>
                          <div className="text-xs text-gray-400">{transaction.discountCode}</div>
                          <div className="text-red-600">-<Currency amount={transaction.discountAmount} /></div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Currency amount={transaction.total} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800">
                        {transaction.paymentMethod}
                      </span>
                      {transaction.paymentMethod === 'cash' && transaction.change !== undefined && (
                        <div className="text-xs text-gray-500 mt-1">{dict.transactions?.change || dict.admin?.change || 'Change'}: <Currency amount={transaction.change} /></div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${
                        transaction.status === 'completed' ? 'bg-green-100 text-green-800' :
                        transaction.status === 'refunded' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {transaction.status === 'completed' ? (dict.transactions?.completed || dict.admin?.completed || 'completed') :
                         transaction.status === 'cancelled' ? (dict.transactions?.cancelled || dict.admin?.cancelled || 'cancelled') :
                         transaction.status === 'refunded' ? (dict.transactions?.refunded || 'refunded') :
                         transaction.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {dict.common?.view || 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No transactions found'}</div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 disabled:opacity-50 bg-white"
              >
                {dict.transactions?.previous || dict.common?.previous || 'Previous'}
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                {dict.transactions?.page || dict.admin?.page || 'Page'} {page} {dict.transactions?.of || dict.admin?.of || 'of'} {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 disabled:opacity-50 bg-white"
              >
                {dict.transactions?.next || dict.common?.next || 'Next'}
              </button>
            </div>
          )}
        </div>

        {selectedTransaction && (
          <TransactionDetailModal
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function TransactionDetailModal({
  transaction,
  onClose,
  dict,
}: {
  transaction: Transaction;
  onClose: () => void;
  dict: any;
}) {
  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {dict.admin?.transactionDetails || 'Transaction Details'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.admin?.receiptNumber || 'Receipt Number'}</label>
                <div className="text-lg font-mono">{transaction.receiptNumber || '-'}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.transactions?.date || dict.admin?.date || 'Date'}</label>
                <div className="text-lg">{new Date(transaction.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.admin?.status || 'Status'}</label>
                <div>
                  <span className={`px-2 py-1 text-xs font-semibold border ${
                    transaction.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' :
                    transaction.status === 'refunded' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                    'bg-red-100 text-red-800 border-red-300'
                  }`}>
                    {transaction.status === 'completed' ? (dict.transactions?.completed || dict.admin?.completed || 'completed') :
                     transaction.status === 'cancelled' ? (dict.transactions?.cancelled || dict.admin?.cancelled || 'cancelled') :
                     transaction.status === 'refunded' ? (dict.transactions?.refunded || 'refunded') :
                     transaction.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.transactions?.payment || 'Payment Method'}</label>
                <div className="text-lg capitalize">{transaction.paymentMethod}</div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 mb-2 block">{dict.transactions?.items || 'Items'}</label>
              <div className="border border-gray-300 divide-y">
                {transaction.items.map((item, idx) => (
                  <div key={idx} className="p-3 flex justify-between">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">Qty: {item.quantity} × <Currency amount={item.price} /></div>
                    </div>
                    <div className="font-medium"><Currency amount={item.subtotal} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">{dict.admin?.subtotal || 'Subtotal'}:</span>
                <span className="font-medium"><Currency amount={transaction.subtotal} /></span>
              </div>
              {transaction.discountAmount && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({transaction.discountCode}):</span>
                  <span>-<Currency amount={transaction.discountAmount} /></span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span><Currency amount={transaction.total} /></span>
              </div>
              {transaction.paymentMethod === 'cash' && transaction.cashReceived && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Cash Received:</span>
                  <span><Currency amount={transaction.cashReceived} /></span>
                </div>
              )}
              {transaction.paymentMethod === 'cash' && transaction.change !== undefined && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Change:</span>
                  <span><Currency amount={transaction.change} /></span>
                </div>
              )}
            </div>
            {transaction.notes && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-1 block">Notes</label>
                <div className="p-3 bg-gray-50 border border-gray-300">{transaction.notes}</div>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
            >
              {dict.common?.close || 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

