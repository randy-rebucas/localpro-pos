'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { useTransactionsList, type Transaction } from '@/hooks/useTransactionsList';
import {
  getStatusColor,
  formatStatusLabel,
  formatTransactionDate,
  getItemCountLabel,
  formatPaymentMethod,
  hasDiscount,
  hasCashChange,
  hasCashReceived,
} from '@/lib/transactions-helpers';

export default function TransactionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const { settings: tenantSettings } = useTenantSettings();
  const primaryColor = (tenantSettings || getDefaultTenantSettings()).primaryColor || '#2563eb';

  const { transactions, loading, page, totalPages, message, fetchTransactions, goToPage } =
    useTransactionsList();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchTransactions(1, dict);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict]);

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block animate-spin h-8 w-8"
            style={{
              borderTop: `2px solid ${primaryColor}`,
              borderRight: `2px solid ${primaryColor}`,
              borderBottom: '2px solid transparent',
              borderLeft: `2px solid ${primaryColor}`,
              borderRadius: '50%',
            }}
          />
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center font-medium mb-4 transition-colors"
            style={{ color: primaryColor }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.transactions || 'Transactions'}
              </h1>
              <p className="text-gray-600">{dict.admin?.transactionsSubtitle || 'View and manage all sales transactions'}</p>
            </div>
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
                      {formatTransactionDate(transaction.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {getItemCountLabel(transaction.items.length, dict)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      <Currency amount={transaction.subtotal} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {hasDiscount(transaction) ? (
                        <div>
                          <div className="text-xs text-gray-400">{transaction.discountCode}</div>
                          <div className="text-red-600">-<Currency amount={transaction.discountAmount!} /></div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Currency amount={transaction.total} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span
                        className="px-2 py-1 text-xs font-semibold border"
                        style={{
                          backgroundColor: `${primaryColor}20`,
                          color: primaryColor,
                          borderColor: primaryColor,
                        }}
                      >
                        {formatPaymentMethod(transaction.paymentMethod)}
                      </span>
                      {hasCashChange(transaction) && (
                        <div className="text-xs text-gray-500 mt-1">
                          {dict && typeof dict.transactions === 'object' && 'change' in dict.transactions
                            ? String(dict.transactions.change)
                            : dict && typeof dict.admin === 'object' && 'change' in dict.admin
                            ? String(dict.admin.change)
                            : 'Change'}
                          : <Currency amount={transaction.change!} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(transaction.status)}`}>
                        {formatStatusLabel(transaction.status, dict)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => setSelectedTransaction(transaction)}
                        style={{ color: primaryColor }}
                        className="hover:opacity-70 transition-opacity"
                      >
                        {dict && typeof dict.common === 'object' && 'view' in dict.common
                          ? String(dict.common.view)
                          : 'View'}
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
                onClick={() => goToPage(page - 1, dict)}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 disabled:opacity-50 bg-white"
              >
                {dict.transactions?.previous || dict.common?.previous || 'Previous'}
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                {dict.transactions?.page || dict.admin?.page || 'Page'} {page} {dict.transactions?.of || dict.admin?.of || 'of'} {totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1, dict)}
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
            primaryColor={primaryColor}
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
  primaryColor: _primaryColor = '#2563eb',
  onClose,
  dict,
}: {
  transaction: Transaction;
  primaryColor?: string;
  onClose: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
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
                <div className="text-lg">{formatTransactionDate(transaction.createdAt)}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.admin?.status || 'Status'}</label>
                <div>
                  <span className={`px-2 py-1 text-xs font-semibold border ${getStatusColor(transaction.status)}`}>
                    {formatStatusLabel(transaction.status, dict)}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">{dict.transactions?.payment || 'Payment Method'}</label>
                <div className="text-lg capitalize">{formatPaymentMethod(transaction.paymentMethod)}</div>
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
              {hasDiscount(transaction) && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({transaction.discountCode}):</span>
                  <span>-<Currency amount={transaction.discountAmount!} /></span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span><Currency amount={transaction.total} /></span>
              </div>
              {hasCashReceived(transaction) && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{dict.transactions?.cashReceived || 'Cash Received'}:</span>
                  <span><Currency amount={transaction.cashReceived!} /></span>
                </div>
              )}
              {hasCashChange(transaction) && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{dict.admin?.change || dict.transactions?.change || 'Change'}:</span>
                  <span><Currency amount={transaction.change!} /></span>
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

