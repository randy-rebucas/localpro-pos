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
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const [dict, setDict] = useState<any>(null);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Load display mode from localStorage
  useEffect(() => {
    const savedDisplayMode = localStorage.getItem(`transactionsDisplayMode_${tenant}`);
    if (savedDisplayMode === 'list' || savedDisplayMode === 'grid') {
      setDisplayMode(savedDisplayMode);
    }
  }, [tenant]);

  // Save display mode to localStorage
  useEffect(() => {
    localStorage.setItem(`transactionsDisplayMode_${tenant}`, displayMode);
  }, [displayMode, tenant]);

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
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
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
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
            {/* Display Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setDisplayMode('grid')}
                className={`px-4 py-2.5 sm:py-2 bg-white border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium touch-manipulation min-h-[44px] sm:min-h-0 ${
                  displayMode === 'grid'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-blue-500'
                }`}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                onClick={() => setDisplayMode('list')}
                className={`px-4 py-2.5 sm:py-2 bg-white border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium touch-manipulation min-h-[44px] sm:min-h-0 ${
                  displayMode === 'list'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-blue-500'
                }`}
                title="List View"
                aria-label="List View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          displayMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 w-2/3 mb-3"></div>
                  <div className="h-5 bg-gray-200 w-1/2 mb-4"></div>
                  <div className="h-4 bg-gray-200 w-full mb-2"></div>
                  <div className="h-4 bg-gray-200 w-3/4 mb-4"></div>
                  <div className="border-t border-gray-200 pt-4">
                    <div className="h-6 bg-gray-200 w-24"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-gray-300 divide-y divide-gray-300">
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
          )
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
        ) : displayMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredItems.map((item) => {
              if (item.type === 'transaction') {
                const transaction = item.data as Transaction;
                return (
                  <div key={transaction._id} className="group relative bg-white border border-gray-300 rounded-lg p-4 sm:p-5 hover:shadow-lg hover:border-blue-300 transition-all duration-200 flex flex-col">
                    <div className="flex-1 mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions.date}</div>
                          <div className="text-sm text-gray-600"><FormattedDate date={transaction.createdAt} includeTime={true} /></div>
                        </div>
                        <span className={`inline-block px-2.5 py-1 text-xs font-medium border ${transaction.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                          {dict.transactions[transaction.status]}
                        </span>
                      </div>
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">{dict.transactions.items}</div>
                        <div className="text-sm font-medium text-gray-900">
                          {transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="inline-block px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 capitalize border border-blue-300">
                          {dict.pos[transaction.paymentMethod]}
                        </span>
                        {transaction.cashReceived && (
                          <div className="text-xs text-gray-500">
                            {dict.transactions.cash}: <Currency amount={transaction.cashReceived} />
                            {transaction.change && <span className="ml-1">{dict.transactions.change}: <Currency amount={transaction.change} /></span>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-4 mt-auto">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">{dict.common.total}</div>
                          <div className="font-bold text-blue-600 text-xl sm:text-2xl"><Currency amount={transaction.total} /></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedTransaction(selectedTransaction?._id === transaction._id ? null : transaction); setSelectedExpense(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          <span className="hidden sm:inline">{selectedTransaction?._id === transaction._id ? dict.transactions.hide : dict.transactions.view}</span>
                        </button>
                        <button onClick={() => printReceipt(transaction)} className="flex-1 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 border border-blue-700 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium" title={dict.common.print} aria-label={dict.common.print}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          <span className="hidden sm:inline">{dict.common.print}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              } else {
                const expense = item.data as Expense;
                return (
                  <div key={expense._id} className="group relative bg-white border-l-4 border-red-500 border border-gray-300 rounded-lg p-4 sm:p-5 hover:shadow-lg hover:border-red-400 transition-all duration-200 flex flex-col">
                    <div className="flex-1 mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions.date}</div>
                          <div className="text-sm text-gray-600"><FormattedDate date={expense.date || expense.createdAt} includeTime={true} /></div>
                        </div>
                        <span className="inline-block px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">{dict.transactions?.expense || 'Expense'}</span>
                      </div>
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">{dict.transactions?.name || 'Name'}</div>
                        <div className="text-base font-semibold text-gray-900">{expense.name}</div>
                        {expense.description && <div className="text-sm text-gray-500 mt-1 line-clamp-2">{expense.description}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 capitalize border border-red-300">{dict.pos?.[expense.paymentMethod] || expense.paymentMethod}</span>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-4 mt-auto">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">{dict.common.total}</div>
                          <div className="font-bold text-red-600 text-xl sm:text-2xl"><Currency amount={expense.amount} /></div>
                        </div>
                      </div>
                      <button onClick={() => { setSelectedExpense(selectedExpense?._id === expense._id ? null : expense); setSelectedTransaction(null); }} className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        <span className="hidden sm:inline">{selectedExpense?._id === expense._id ? dict.transactions.hide : dict.transactions.view}</span>
                      </button>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        ) : (
          <div className="bg-white border border-gray-300 divide-y divide-gray-300">
            {filteredItems.map((item) => {
              if (item.type === 'transaction') {
                const transaction = item.data as Transaction;
                return (
                  <div key={transaction._id} className="group relative px-4 sm:px-6 py-4 sm:py-5 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-1">
                            <div className="text-xs text-gray-500 mb-1">{dict.transactions.date}</div>
                            <div className="text-sm text-gray-600"><FormattedDate date={transaction.createdAt} includeTime={true} /></div>
                          </div>
                          <span className={`inline-block px-2.5 py-1 text-xs font-medium border ${transaction.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>{dict.transactions[transaction.status]}</span>
                        </div>
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions.items}</div>
                          <div className="text-sm font-medium text-gray-900">{transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}</div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-gray-600">
                          <span className="inline-block px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 capitalize border border-blue-300">{dict.pos[transaction.paymentMethod]}</span>
                          {transaction.cashReceived && (
                            <div className="text-xs text-gray-500">
                              {dict.transactions.cash}: <Currency amount={transaction.cashReceived} />
                              {transaction.change && <span className="ml-1">{dict.transactions.change}: <Currency amount={transaction.change} /></span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1 hidden sm:block">{dict.common.total}</div>
                          <div className="font-bold text-blue-600 text-lg sm:text-xl"><Currency amount={transaction.total} /></div>
                        </div>
                        <div className="flex gap-2 actions-touch-visible transition-opacity duration-200">
                          <button onClick={() => { setSelectedTransaction(selectedTransaction?._id === transaction._id ? null : transaction); setSelectedExpense(null); }} className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0" title={selectedTransaction?._id === transaction._id ? dict.transactions.hide : dict.transactions.view}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button onClick={() => printReceipt(transaction)} className="px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 border border-blue-700 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0" title={dict.common.print} aria-label={dict.common.print}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                const expense = item.data as Expense;
                return (
                  <div key={expense._id} className="group relative px-4 sm:px-6 py-4 sm:py-5 hover:bg-gray-50 transition-colors border-l-4 border-red-500">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex-1">
                            <div className="text-xs text-gray-500 mb-1">{dict.transactions.date}</div>
                            <div className="text-sm text-gray-600"><FormattedDate date={expense.date || expense.createdAt} includeTime={true} /></div>
                          </div>
                          <span className="inline-block px-2.5 py-1 text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">{dict.transactions?.expense || 'Expense'}</span>
                        </div>
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions?.name || 'Name'}</div>
                          <div className="text-base font-semibold text-gray-900">{expense.name}</div>
                          {expense.description && <div className="text-sm text-gray-500 mt-1 line-clamp-1">{expense.description}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-block px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 capitalize border border-red-300">{dict.pos?.[expense.paymentMethod] || expense.paymentMethod}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1 hidden sm:block">{dict.common.total}</div>
                          <div className="font-bold text-red-600 text-lg sm:text-xl"><Currency amount={expense.amount} /></div>
                        </div>
                        <button onClick={() => { setSelectedExpense(selectedExpense?._id === expense._id ? null : expense); setSelectedTransaction(null); }} className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0" title={selectedExpense?._id === expense._id ? dict.transactions.hide : dict.transactions.view}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
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

