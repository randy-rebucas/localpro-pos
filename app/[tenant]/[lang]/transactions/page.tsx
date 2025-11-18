'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';

interface TransactionItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface Transaction {
  _id: string;
  items: TransactionItem[];
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled';
  createdAt: string;
}

export default function TransactionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [dict, setDict] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchTransactions();
  }, [page, tenant]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?page=${page}&limit=20&tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
        setTotalPages(data.pagination.pages);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const printReceipt = (transaction: Transaction) => {
    if (!dict) return;
    const receiptWindow = window.open('', '_blank');
    if (!receiptWindow) return;

    const receiptContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              width: 300px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              border-bottom: 2px dashed #000;
              padding-bottom: 10px;
              margin-bottom: 10px;
            }
            .item {
              display: flex;
              justify-content: space-between;
              margin-bottom: 5px;
            }
            .total {
              border-top: 2px dashed #000;
              padding-top: 10px;
              margin-top: 10px;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>POS SYSTEM</h2>
            <p>Receipt #${transaction._id.slice(-8)}</p>
            <p>${formatDate(transaction.createdAt)}</p>
          </div>
          ${transaction.items
            .map(
              (item) => `
            <div class="item">
              <div>
                <div>${item.name} x${item.quantity}</div>
                <div style="font-size: 12px;">@ $${item.price.toFixed(2)}</div>
              </div>
              <div>$${item.subtotal.toFixed(2)}</div>
            </div>
          `
            )
            .join('')}
          <div class="total">
            <div class="item">
              <div>${dict.common.total}:</div>
              <div>$${transaction.total.toFixed(2)}</div>
            </div>
            <div class="item">
              <div>${dict.transactions.payment}: ${transaction.paymentMethod.toUpperCase()}</div>
            </div>
            ${transaction.cashReceived
              ? `
                <div class="item">
                  <div>${dict.transactions.cash}:</div>
                  <div>$${transaction.cashReceived.toFixed(2)}</div>
                </div>
                <div class="item">
                  <div>${dict.transactions.change}:</div>
                  <div>$${transaction.change?.toFixed(2) || '0.00'}</div>
                </div>
              `
              : ''}
          </div>
          <div class="footer">
            <p>Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;

    receiptWindow.document.write(receiptContent);
    receiptWindow.document.close();
    receiptWindow.print();
  };

  if (!dict) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{dict.transactions.title}</h1>

        {loading ? (
          <div className="text-center py-12">{dict.transactions.loading}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">{dict.transactions.noTransactions}</div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction._id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="text-sm text-gray-500 mb-1">
                        {formatDate(transaction.createdAt)}
                      </div>
                      <div className="text-lg font-semibold text-gray-900">
                        ${transaction.total.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          transaction.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {dict.transactions[transaction.status]}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                        {dict.pos[transaction.paymentMethod]}
                      </span>
                    </div>
                  </div>
                  {transaction.cashReceived && (
                    <div className="text-xs text-gray-500 mb-3">
                      {dict.transactions.cash}: ${transaction.cashReceived.toFixed(2)}
                      {transaction.change && (
                        <span className="ml-2">{dict.transactions.change}: ${transaction.change.toFixed(2)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 pt-3 border-t">
                    <button
                      onClick={() =>
                        setSelectedTransaction(
                          selectedTransaction?._id === transaction._id ? null : transaction
                        )
                      }
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium"
                    >
                      {selectedTransaction?._id === transaction._id ? dict.transactions.hideDetails : dict.transactions.viewDetails}
                    </button>
                    <button
                      onClick={() => printReceipt(transaction)}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      {dict.common.print}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.transactions.date}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.transactions.items}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.common.total}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.transactions.payment}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.transactions.status}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {dict.common.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((transaction) => (
                    <tr key={transaction._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(transaction.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}
                        <button
                          onClick={() =>
                            setSelectedTransaction(
                              selectedTransaction?._id === transaction._id ? null : transaction
                            )
                          }
                          className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                        >
                          {selectedTransaction?._id === transaction._id ? dict.transactions.hide : dict.transactions.view}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        ${transaction.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                          {dict.pos[transaction.paymentMethod]}
                        </span>
                        {transaction.cashReceived && (
                          <div className="text-xs text-gray-500 mt-1">
                            {dict.transactions.cash}: ${transaction.cashReceived.toFixed(2)}
                            {transaction.change && (
                              <span className="ml-1">{dict.transactions.change}: ${transaction.change.toFixed(2)}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            transaction.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {dict.transactions[transaction.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => printReceipt(transaction)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {dict.common.print}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Transaction Details */}
            {selectedTransaction && (
              <div className="mt-6 bg-white rounded-lg shadow p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
                  {dict.transactions.transactionDetails} - {formatDate(selectedTransaction.createdAt)}
                </h2>
                <div className="space-y-2">
                  {selectedTransaction.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          ${item.price.toFixed(2)} × {item.quantity}
                        </div>
                      </div>
                      <div className="font-semibold text-gray-900">
                        ${item.subtotal.toFixed(2)}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-lg font-bold text-gray-900">{dict.common.total}:</span>
                    <span className="text-xl font-bold text-blue-600">
                      ${selectedTransaction.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  {dict.transactions.previous}
                </button>
                <span className="px-4 py-2 text-gray-700">
                  {dict.transactions.page} {page} {dict.transactions.of} {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  {dict.transactions.next}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

