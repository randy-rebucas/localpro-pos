'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import FormattedDate from '@/components/FormattedDate';
import PageTitle from '@/components/PageTitle';
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

  // formatDate is now handled by FormattedDate component
  // Keep a simple version for receipt printing (template strings)
  const formatDateForReceipt = (dateString: string) => {
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
            <p>${formatDateForReceipt(transaction.createdAt)}</p>
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
      <PageTitle />
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">{dict.transactions.title}</h1>

        {loading ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="divide-y divide-gray-200">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="p-4 sm:p-6 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="h-5 bg-gray-200 rounded-lg w-1/3 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded-lg w-1/4"></div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-4 bg-gray-200 rounded-lg w-20"></div>
                      <div className="h-4 bg-gray-200 rounded-lg w-16"></div>
                      <div className="h-9 bg-gray-200 rounded-lg w-24"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-md">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-lg">{dict.transactions.noTransactions}</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            {/* Desktop Table Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-700">
              <div className="col-span-2">{dict.transactions.date}</div>
              <div className="col-span-2">{dict.transactions.items}</div>
              <div className="col-span-2 text-right">{dict.common.total}</div>
              <div className="col-span-2">{dict.transactions.payment}</div>
              <div className="col-span-2">{dict.transactions.status}</div>
              <div className="col-span-2 text-right">{dict.common.actions}</div>
            </div>
            {/* Transaction List */}
            <div className="divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <div
                  key={transaction._id}
                  className="group relative px-4 sm:px-6 py-4 hover:bg-gray-50 transition-colors overflow-hidden"
                >
                  {/* Actions - Positioned on top */}
                  <div className="absolute top-0 right-0 bottom-0 w-48 md:w-auto flex items-center justify-end pr-4 md:pr-6 z-10 overflow-hidden">
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-md shadow-lg border-l border-gray-200/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                    <div className="relative z-10 flex gap-1.5 px-3 py-1.5 transform translate-x-full group-hover:translate-x-0 transition-transform duration-300 ease-out">
                      <button
                        onClick={() => printReceipt(transaction)}
                        className="px-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center"
                        title={dict.common.print}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col md:grid md:grid-cols-12 gap-4 items-center">
                    {/* Date - Mobile & Desktop */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.transactions.date}</div>
                      <div className="text-sm text-gray-600">
                        <FormattedDate date={transaction.createdAt} includeTime={true} />
                      </div>
                    </div>
                    {/* Items - Mobile & Desktop */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.transactions.items}</div>
                      <div className="text-sm text-gray-900">
                        {transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}
                        <button
                          onClick={() =>
                            setSelectedTransaction(
                              selectedTransaction?._id === transaction._id ? null : transaction
                            )
                          }
                          className="ml-2 text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          {selectedTransaction?._id === transaction._id ? dict.transactions.hide : dict.transactions.view}
                        </button>
                      </div>
                    </div>
                    {/* Total */}
                    <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.common.total}</div>
                      <div className="font-bold text-blue-600 text-lg">
                        <Currency amount={transaction.total} />
                      </div>
                    </div>
                    {/* Payment Method */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.transactions.payment}</div>
                      <div className="flex flex-col gap-1">
                        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize w-fit">
                          {dict.pos[transaction.paymentMethod]}
                        </span>
                        {transaction.cashReceived && (
                          <div className="text-xs text-gray-500">
                            {dict.transactions.cash}: <Currency amount={transaction.cashReceived} />
                            {transaction.change && (
                              <span className="ml-1">{dict.transactions.change}: <Currency amount={transaction.change} /></span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Status */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-sm text-gray-500 md:hidden mb-1">{dict.transactions.status}</div>
                      <span
                        className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                          transaction.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {dict.transactions[transaction.status]}
                      </span>
                    </div>
                    {/* Actions column - Empty space for absolute positioned actions */}
                    <div className="col-span-2 hidden md:block"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Details */}
        {selectedTransaction && (
          <div className="mt-6 bg-white rounded-xl shadow-md p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-5">
              {dict.transactions.transactionDetails} - <FormattedDate date={selectedTransaction.createdAt} includeTime={true} />
            </h2>
            <div className="space-y-3">
              {selectedTransaction.items.map((item, index) => (
                <div key={index} className="flex justify-between items-center border-b border-gray-200 pb-3">
                  <div>
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-sm text-gray-500">
                      <Currency amount={item.price} /> × {item.quantity}
                    </div>
                  </div>
                  <div className="font-semibold text-gray-900">
                    <Currency amount={item.subtotal} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-3">
                <span className="text-lg font-bold text-gray-900">{dict.common.total}:</span>
                <span className="text-xl font-bold text-blue-600">
                  <Currency amount={selectedTransaction.total} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border-2 border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 font-medium transition-colors shadow-sm"
            >
              {dict.transactions.previous}
            </button>
            <span className="px-4 py-2 text-gray-700 font-medium">
              {dict.transactions.page} {page} {dict.transactions.of} {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border-2 border-gray-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 font-medium transition-colors shadow-sm"
            >
              {dict.transactions.next}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

