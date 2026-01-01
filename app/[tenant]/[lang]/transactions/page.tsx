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

interface Expense {
  _id: string;
  name: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: 'cash' | 'card' | 'digital' | 'other';
  receipt?: string;
  notes?: string;
  userId?: string | { name: string; email: string };
  createdAt: string;
}

type ViewType = 'all' | 'transactions' | 'expenses';

export default function TransactionsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [viewType, setViewType] = useState<ViewType>('all');
  const [dict, setDict] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchTransactions();
    fetchExpenses();
  }, [page, tenant, viewType]);

  const fetchTransactions = async () => {
    try {
      const res = await fetch(`/api/transactions?page=${page}&limit=20&tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
        setTotalPages(data.pagination.pages);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchExpenses = async () => {
    try {
      const res = await fetch(`/api/expenses?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setExpenses(data.data);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
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
          <title>${dict.pos.receipt || 'Receipt'}</title>
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
            <h2>${dict.pos.receiptTitle || 'POS SYSTEM'}</h2>
            <p>${dict.pos.receiptNumber || 'Receipt'} #${transaction._id.slice(-8)}</p>
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
            <p>${dict.pos.thankYou || 'Thank you for your business!'}</p>
          </div>
        </body>
      </html>
    `;

    receiptWindow.document.write(receiptContent);
    receiptWindow.document.close();
    receiptWindow.print();
  };

  if (!dict) {
    return <div className="text-center py-12">{dict?.common?.loading || 'Loading...'}</div>;
  }

  // Combine and sort transactions and expenses by date
  const allItems = [
    ...transactions.map(t => ({ type: 'transaction' as const, data: t, date: t.createdAt })),
    ...expenses.map(e => ({ type: 'expense' as const, data: e, date: e.date || e.createdAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredItems = viewType === 'all' 
    ? allItems 
    : viewType === 'transactions' 
    ? allItems.filter(item => item.type === 'transaction')
    : allItems.filter(item => item.type === 'expense');

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTitle />
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="flex flex-col gap-4 sm:gap-6 mb-4 sm:mb-6 lg:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{dict.transactions.title}</h1>
          {/* View Type Toggle - Mobile-first */}
          <div className="flex gap-0 bg-white border border-gray-300 w-full sm:w-auto">
            {(['all', 'transactions', 'expenses'] as ViewType[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setViewType(view)}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all duration-200 touch-manipulation min-h-[44px] sm:min-h-0 border-r border-gray-300 last:border-r-0 ${
                  viewType === view
                    ? 'text-white bg-blue-600'
                    : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 bg-white'
                }`}
              >
                {view === 'all' 
                  ? (dict.transactions?.all || 'All')
                  : view === 'transactions'
                  ? (dict.transactions?.transactions || 'Transactions')
                  : (dict.transactions?.expenses || 'Expenses')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white border border-gray-300 overflow-hidden">
            <div className="divide-y divide-gray-300">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="p-4 sm:p-5 lg:p-6 animate-pulse">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 sm:h-5 bg-gray-200 w-1/2 sm:w-1/3"></div>
                      <div className="h-3 sm:h-4 bg-gray-200 w-1/3 sm:w-1/4"></div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                      <div className="h-3 sm:h-4 bg-gray-200 w-16 sm:w-20"></div>
                      <div className="h-3 sm:h-4 bg-gray-200 w-12 sm:w-16"></div>
                      <div className="h-10 sm:h-9 bg-gray-200 w-20 sm:w-24"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 sm:py-16 bg-white border border-gray-300 px-4">
            <svg className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500 text-base sm:text-lg">
              {viewType === 'expenses' 
                ? (dict.transactions?.noExpenses || 'No expenses found')
                : dict.transactions.noTransactions}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-300 overflow-hidden">
            {/* Desktop Table Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-4 bg-gray-100 border-b border-gray-300 text-sm font-semibold text-gray-700">
              <div className="col-span-2">{dict.transactions.date}</div>
              <div className="col-span-2">{viewType === 'expenses' ? (dict.transactions?.name || 'Name') : dict.transactions.items}</div>
              <div className="col-span-2 text-right">{dict.common.total}</div>
              <div className="col-span-2">{dict.transactions.payment}</div>
              <div className="col-span-2">{viewType === 'expenses' ? (dict.transactions?.type || 'Type') : dict.transactions.status}</div>
              <div className="col-span-2 text-right">{dict.common.actions}</div>
            </div>
            {/* Transaction/Expense List */}
            <div className="divide-y divide-gray-300">
              {filteredItems.map((item) => {
                if (item.type === 'transaction') {
                  const transaction = item.data as Transaction;
                  return (
                <div
                  key={transaction._id}
                  className="group relative px-4 sm:px-6 py-4 sm:py-5 hover:bg-gray-50 transition-colors"
                >
                  {/* Mobile-first layout: Stack on mobile, grid on desktop */}
                  <div className="flex flex-col md:grid md:grid-cols-12 gap-3 sm:gap-4">
                    {/* Date - Mobile & Desktop */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.date}</div>
                      <div className="text-sm sm:text-base text-gray-600">
                        <FormattedDate date={transaction.createdAt} includeTime={true} />
                      </div>
                    </div>
                    {/* Items - Mobile & Desktop */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.items}</div>
                      <div className="text-sm sm:text-base text-gray-900">
                        {transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}
                        <button
                          onClick={() => {
                            setSelectedTransaction(
                              selectedTransaction?._id === transaction._id ? null : transaction
                            );
                            setSelectedExpense(null);
                          }}
                          className="ml-2 text-blue-600 hover:text-blue-800 active:text-blue-900 text-xs sm:text-sm font-medium touch-manipulation"
                        >
                          {selectedTransaction?._id === transaction._id ? dict.transactions.hide : dict.transactions.view}
                        </button>
                      </div>
                    </div>
                    {/* Total */}
                    <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.common.total}</div>
                      <div className="font-bold text-blue-600 text-lg sm:text-xl">
                        <Currency amount={transaction.total} />
                      </div>
                    </div>
                    {/* Payment Method */}
                    <div className="col-span-2 w-full md:w-auto">
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.payment}</div>
                      <div className="flex flex-col gap-1">
                        <span className="inline-block px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 capitalize w-fit border border-blue-300">
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
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.status}</div>
                      <span
                        className={`inline-block px-2.5 py-1 text-xs font-medium border ${
                          transaction.status === 'completed'
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {dict.transactions[transaction.status]}
                      </span>
                    </div>
                    {/* Actions - Always visible on touch devices, hover on hover-capable devices */}
                    <div className="col-span-2 w-full md:w-auto flex md:justify-end">
                      <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium w-full">{dict.common.actions}</div>
                      <div className="flex gap-2 md:gap-1.5 w-full md:w-auto actions-touch-visible transition-opacity duration-200">
                        <button
                          onClick={() => printReceipt(transaction)}
                          className="flex-1 md:flex-none px-4 py-3 md:px-3 md:py-2 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 border border-blue-700 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] md:min-h-0"
                          title={dict.common.print}
                          aria-label={dict.common.print}
                        >
                          <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          <span className="md:hidden text-sm font-medium">{dict.common.print}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                  );
                } else {
                  const expense = item.data as Expense;
                  return (
                    <div
                      key={expense._id}
                      className="group relative px-4 sm:px-6 py-4 sm:py-5 hover:bg-gray-50 transition-colors border-l-4 border-red-500"
                    >
                      <div className="flex flex-col md:grid md:grid-cols-12 gap-3 sm:gap-4">
                        {/* Date */}
                        <div className="col-span-2 w-full md:w-auto">
                          <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.date}</div>
                          <div className="text-sm sm:text-base text-gray-600">
                            <FormattedDate date={expense.date || expense.createdAt} includeTime={true} />
                          </div>
                        </div>
                        {/* Name */}
                        <div className="col-span-2 w-full md:w-auto">
                          <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions?.name || 'Name'}</div>
                          <div className="text-sm sm:text-base text-gray-900 font-medium">{expense.name}</div>
                          {expense.description && (
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{expense.description}</div>
                          )}
                          <button
                            onClick={() => {
                              setSelectedExpense(
                                selectedExpense?._id === expense._id ? null : expense
                              );
                              setSelectedTransaction(null);
                            }}
                            className="mt-1 text-red-600 hover:text-red-800 active:text-red-900 text-xs sm:text-sm font-medium touch-manipulation"
                          >
                            {selectedExpense?._id === expense._id ? dict.transactions.hide : dict.transactions.view}
                          </button>
                        </div>
                        {/* Amount */}
                        <div className="col-span-2 w-full md:w-auto text-left md:text-right">
                          <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.common.total}</div>
                          <div className="font-bold text-red-600 text-lg sm:text-xl">
                            <Currency amount={expense.amount} />
                          </div>
                        </div>
                        {/* Payment Method */}
                        <div className="col-span-2 w-full md:w-auto">
                          <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions.payment}</div>
                          <span className="inline-block px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 capitalize w-fit border border-red-300">
                            {dict.pos?.[expense.paymentMethod] || expense.paymentMethod}
                          </span>
                        </div>
                        {/* Type */}
                        <div className="col-span-2 w-full md:w-auto">
                          <div className="text-xs sm:text-sm text-gray-500 md:hidden mb-1 font-medium">{dict.transactions?.type || 'Type'}</div>
                          <span className="inline-block px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                            {dict.transactions?.expense || 'Expense'}
                          </span>
                        </div>
                        {/* Actions column - Empty on desktop for alignment */}
                        <div className="col-span-2 hidden md:block"></div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          </div>
        )}

        {/* Transaction Details */}
        {selectedTransaction && (
          <div className="mt-4 sm:mt-6 bg-white border border-gray-300 p-4 sm:p-5 lg:p-6">
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mb-4 sm:mb-5">
              <span className="block sm:inline">{dict.transactions.transactionDetails}</span>
              <span className="block sm:inline sm:ml-2 text-sm sm:text-base font-normal text-gray-600 mt-1 sm:mt-0">
                <FormattedDate date={selectedTransaction.createdAt} includeTime={true} />
              </span>
            </h2>
            <div className="space-y-3 sm:space-y-4">
              {selectedTransaction.items.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-gray-300 pb-3">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm sm:text-base">{item.name}</div>
                    <div className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      <Currency amount={item.price} /> × {item.quantity}
                    </div>
                  </div>
                  <div className="font-semibold text-gray-900 text-base sm:text-lg">
                    <Currency amount={item.subtotal} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 sm:pt-3 border-t-2 border-gray-300 mt-2">
                <span className="text-base sm:text-lg font-bold text-gray-900">{dict.common.total}:</span>
                <span className="text-lg sm:text-xl font-bold text-blue-600">
                  <Currency amount={selectedTransaction.total} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Expense Details */}
        {selectedExpense && (
          <div className="mt-4 sm:mt-6 bg-white border border-gray-300 border-l-4 border-l-red-500 p-4 sm:p-5 lg:p-6">
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 mb-4 sm:mb-5">
              <span className="block sm:inline">{dict.transactions?.expenseDetails || 'Expense Details'}</span>
              <span className="block sm:inline sm:ml-2 text-sm sm:text-base font-normal text-gray-600 mt-1 sm:mt-0">
                <FormattedDate date={selectedExpense.date || selectedExpense.createdAt} includeTime={true} />
              </span>
            </h2>
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-gray-300 pb-3">
                <span className="text-xs sm:text-sm font-medium text-gray-500">{dict.transactions?.name || 'Name'}:</span>
                <span className="text-sm sm:text-base font-semibold text-gray-900">{selectedExpense.name}</span>
              </div>
              {selectedExpense.description && (
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 border-b border-gray-300 pb-3">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">{dict.transactions?.description || 'Description'}:</span>
                  <span className="text-sm text-gray-900 text-left sm:text-right">{selectedExpense.description}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 border-b border-gray-300 pb-3">
                <span className="text-xs sm:text-sm font-medium text-gray-500">{dict.transactions.payment}:</span>
                <span className="inline-block px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 capitalize w-fit border border-red-300">
                  {dict.pos?.[selectedExpense.paymentMethod] || selectedExpense.paymentMethod}
                </span>
              </div>
              {selectedExpense.notes && (
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 border-b border-gray-300 pb-3">
                  <span className="text-xs sm:text-sm font-medium text-gray-500">{dict.transactions?.notes || 'Notes'}:</span>
                  <span className="text-sm text-gray-900 text-left sm:text-right">{selectedExpense.notes}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 sm:pt-3 border-t-2 border-gray-300 mt-2">
                <span className="text-base sm:text-lg font-bold text-gray-900">{dict.common.total}:</span>
                <span className="text-lg sm:text-xl font-bold text-red-600">
                  <Currency amount={selectedExpense.amount} />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Pagination - Mobile-first */}
        {totalPages > 1 && (
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 active:bg-gray-200 font-medium transition-colors bg-white touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {dict.transactions.previous}
            </button>
            <span className="px-4 py-2 text-sm sm:text-base text-gray-700 font-medium text-center">
              {dict.transactions.page} {page} {dict.transactions.of} {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 active:bg-gray-200 font-medium transition-colors bg-white touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {dict.transactions.next}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

