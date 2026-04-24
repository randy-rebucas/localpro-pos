'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import FormattedDate from '@/components/FormattedDate';
import PageTitle from '@/components/PageTitle';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';
import { hardwareService } from '@/lib/hardware';

interface TransactionItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface Transaction {
  _id: string;
  receiptNumber?: string;
  items: TransactionItem[];
  subtotal?: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
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
  const [adjustTransaction, setAdjustTransaction] = useState<Transaction | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState(false);

  // Manual transaction modal
  const [showAddModal, setShowAddModal] = useState(false);
  interface ManualLineItem { name: string; price: string; quantity: string; }
  const emptyItem = (): ManualLineItem => ({ name: '', price: '', quantity: '1' });
  const [manualItems, setManualItems] = useState<ManualLineItem[]>([emptyItem()]);
  const [manualPayment, setManualPayment] = useState<'cash' | 'card' | 'digital'>('cash');
  const [manualCash, setManualCash] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState(false);

  // Manual expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseName, setExpenseName] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expensePayment, setExpensePayment] = useState<'cash' | 'card' | 'digital' | 'other'>('cash');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [expenseSuccess, setExpenseSuccess] = useState(false);

  const [viewType, setViewType] = useState<ViewType>('all');
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const { settings: tenantSettings } = useTenantSettings();
  const primaryColor = (tenantSettings || getDefaultTenantSettings()).primaryColor || '#35979c';

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // Initialize hardware config from localStorage or tenant settings
  useEffect(() => {
    if (!tenant) return;
    const stored = localStorage.getItem(`hardware_config_${tenant}`);
    if (stored) {
      try {
        hardwareService.setConfig(JSON.parse(stored));
      } catch { /* ignore */ }
    } else if (tenantSettings?.hardwareConfig) {
      hardwareService.setConfig(tenantSettings.hardwareConfig);
    }
  }, [tenant, tenantSettings]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tenant]);

  useEffect(() => {
    fetchExpenses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/transactions?page=${page}&limit=20&tenant=${tenant}`, { credentials: 'include' });
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

  const fetchExpenses = async () => {
    try {
      const res = await fetch(`/api/expenses?tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setExpenses(data.data);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    }
  };

  // formatDate is now handled by FormattedDate component
  // Keep a simple version for receipt printing (template strings)

  const doRefund = async () => {
    if (!adjustTransaction) return;
    setAdjustLoading(true);
    setAdjustError('');
    try {
      const res = await fetch(`/api/transactions/${adjustTransaction._id}/refund?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: adjustReason, notes: adjustNotes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAdjustError(data.error || 'Refund failed');
      } else {
        setAdjustSuccess(true);
        // Refresh transactions list
        fetchTransactions();
        // Update local state so the card reflects refunded status
        setTransactions((prev) =>
          prev.map((t) => (t._id === adjustTransaction._id ? { ...t, status: 'refunded' } : t))
        );
      }
    } catch {
      setAdjustError('Network error. Please try again.');
    } finally {
      setAdjustLoading(false);
    }
  };

  const openAdjustModal = (transaction: Transaction) => {
    setAdjustTransaction(transaction);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError('');
    setAdjustSuccess(false);
  };

  const closeAdjustModal = () => {
    setAdjustTransaction(null);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError('');
    setAdjustSuccess(false);
  };

  const submitManualTransaction = async () => {
    setManualLoading(true);
    setManualError('');
    try {
      const parsedItems = manualItems.map((it) => ({
        name: it.name.trim(),
        price: parseFloat(it.price),
        quantity: parseInt(it.quantity, 10),
      }));

      // client-side validation
      for (const it of parsedItems) {
        if (!it.name) { setManualError('Each item must have a name.'); setManualLoading(false); return; }
        if (isNaN(it.price) || it.price < 0) { setManualError(`Invalid price for "${it.name}".`); setManualLoading(false); return; }
        if (isNaN(it.quantity) || it.quantity < 1) { setManualError(`Invalid quantity for "${it.name}".`); setManualLoading(false); return; }
      }

      const body: Record<string, unknown> = { items: parsedItems, paymentMethod: manualPayment, notes: manualNotes || undefined };
      if (manualPayment === 'cash' && manualCash) body.cashReceived = parseFloat(manualCash);

      const res = await fetch(`/api/transactions/manual?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setManualError(data.error || 'Failed to create transaction');
      } else {
        setManualSuccess(true);
        fetchTransactions();
      }
    } catch {
      setManualError('Network error. Please try again.');
    } finally {
      setManualLoading(false);
    }
  };

  const submitManualExpense = async () => {
    setExpenseLoading(true);
    setExpenseError('');
    try {
      if (!expenseName.trim()) { setExpenseError('Name is required.'); setExpenseLoading(false); return; }
      if (!expenseDescription.trim()) { setExpenseError('Description is required.'); setExpenseLoading(false); return; }
      const parsedAmount = parseFloat(expenseAmount);
      if (isNaN(parsedAmount) || parsedAmount < 0) { setExpenseError('A valid amount is required.'); setExpenseLoading(false); return; }

      const res = await fetch(`/api/expenses?tenant=${tenant}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: expenseName.trim(),
          description: expenseDescription.trim(),
          amount: parsedAmount,
          date: expenseDate || new Date().toISOString(),
          paymentMethod: expensePayment,
          notes: expenseNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setExpenseError(data.error || 'Failed to create expense');
      } else {
        setExpenseSuccess(true);
        fetchExpenses();
      }
    } catch {
      setExpenseError('Network error. Please try again.');
    } finally {
      setExpenseLoading(false);
    }
  };

  const formatDateForReceipt = (dateString: string) => {
    const settingsValue = tenantSettings || getDefaultTenantSettings();
    return formatDateTime(dateString, settingsValue);
  };

  const printReceipt = async (transaction: Transaction) => {
    if (!dict) return;
    const receiptData = {
      storeName: tenantSettings?.companyName || dict.pos.receiptTitle || 'POS SYSTEM',
      receiptNumber: transaction.receiptNumber || transaction._id.slice(-8),
      date: formatDateForReceipt(transaction.createdAt),
      items: transaction.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
      })),
      subtotal: transaction.subtotal ?? transaction.total,
      discount: transaction.discountAmount,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      change: transaction.change,
      footer: dict.pos.thankYou || 'Thank you for your business!',
    };
    const success = await hardwareService.printReceipt(receiptData);
    if (!success) {
      console.error('Failed to print receipt');
    }
  };

  if (!dict) {
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
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="flex flex-col gap-4 sm:gap-6 mb-4 sm:mb-6 lg:mb-8">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{dict.transactions.title}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowExpenseModal(true); setExpenseName(''); setExpenseDescription(''); setExpenseAmount(''); setExpenseDate(new Date().toISOString().slice(0, 10)); setExpensePayment('cash'); setExpenseNotes(''); setExpenseError(''); setExpenseSuccess(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border border-red-700 text-sm font-medium transition-colors touch-manipulation min-h-[44px] sm:min-h-0 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="hidden sm:inline">{dict.transactions?.addExpense || 'Add Expense'}</span>
                <span className="sm:hidden">Expense</span>
              </button>
              <button
                onClick={() => { setShowAddModal(true); setManualItems([emptyItem()]); setManualPayment('cash'); setManualCash(''); setManualNotes(''); setManualError(''); setManualSuccess(false); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 border border-green-700 text-sm font-medium transition-colors touch-manipulation min-h-[44px] sm:min-h-0 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                <span className="hidden sm:inline">{dict.transactions?.addManual || 'Add Transaction'}</span>
                <span className="sm:hidden">Sale</span>
              </button>
            </div>
          </div>
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
                      ? 'text-white'
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 bg-white'
                  }`}
                  style={viewType === view ? { backgroundColor: primaryColor } : {}}
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
                    ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
                style={displayMode === 'grid' ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                title={dict?.common?.gridView || 'Grid View'}
                aria-label={dict?.common?.gridView || 'Grid View'}
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
                    ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
                style={displayMode === 'list' ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10`, color: primaryColor } : {}}
                title={dict?.common?.listView || 'List View'}
                aria-label={dict?.common?.listView || 'List View'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">{dict?.common?.listView || 'List'}</span>
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
                  <div key={transaction._id} className="group relative bg-white border border-gray-300 rounded-lg p-4 sm:p-5 hover:shadow-lg hover:border-teal-300 transition-all duration-200 flex flex-col">
                    <div className="flex-1 mb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions.date}</div>
                          <div className="text-sm text-gray-600"><FormattedDate date={transaction.createdAt} includeTime={true} /></div>
                        </div>
                        <span className={`inline-block px-2.5 py-1 text-xs font-medium border ${transaction.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' : transaction.status === 'refunded' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
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
                        <span
                          className="inline-block px-2.5 py-1 text-xs font-medium capitalize border"
                          style={{
                            backgroundColor: `${primaryColor}20`,
                            color: primaryColor,
                            borderColor: primaryColor,
                          }}
                        >
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
                          <div className="font-bold text-xl sm:text-2xl" style={{ color: primaryColor }}><Currency amount={transaction.total} /></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setSelectedTransaction(transaction); setSelectedExpense(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium" title={dict.transactions.view} aria-label={dict.transactions.view}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                        <button onClick={() => printReceipt(transaction)} className="flex-1 px-4 py-2.5 text-white transition-all duration-200 border flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium hover:opacity-80" style={{ backgroundColor: primaryColor, borderColor: primaryColor }} title={dict.common.print} aria-label={dict.common.print}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          <span className="hidden sm:inline">{dict.common.print}</span>
                        </button>
                        {transaction.status === 'completed' && (
                          <button onClick={() => openAdjustModal(transaction)} className="flex-1 px-4 py-2.5 bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-all duration-200 border border-orange-600 flex items-center justify-center gap-2 touch-manipulation min-h-[44px] text-sm font-medium" title={dict.transactions?.adjust || 'Adjust / Refund'}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="hidden sm:inline">{dict.transactions?.adjust || 'Adjust'}</span>
                          </button>
                        )}
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
                          <span className={`inline-block px-2.5 py-1 text-xs font-medium border ${transaction.status === 'completed' ? 'bg-green-100 text-green-800 border-green-300' : transaction.status === 'refunded' ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-red-100 text-red-800 border-red-300'}`}>{dict.transactions[transaction.status]}</span>
                        </div>
                        <div className="mb-2">
                          <div className="text-xs text-gray-500 mb-1">{dict.transactions.items}</div>
                          <div className="text-sm font-medium text-gray-900">{transaction.items.length} {transaction.items.length === 1 ? dict.transactions.item : dict.transactions.items}</div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-gray-600">
                          <span
                            className="inline-block px-2.5 py-1 text-xs font-medium capitalize border"
                            style={{
                              backgroundColor: `${primaryColor}20`,
                              color: primaryColor,
                              borderColor: primaryColor,
                            }}
                          >
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
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1 hidden sm:block">{dict.common.total}</div>
                          <div className="font-bold text-lg sm:text-xl" style={{ color: primaryColor }}><Currency amount={transaction.total} /></div>
                        </div>
                        <div className="flex gap-2 actions-touch-visible transition-opacity duration-200">
                          <button onClick={() => { setSelectedTransaction(transaction); setSelectedExpense(null); }} className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 transition-all duration-200 border border-gray-300 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0" title={dict.transactions.view} aria-label={dict.transactions.view}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button onClick={() => printReceipt(transaction)} className="px-3 py-2 text-white transition-all duration-200 border flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0 hover:opacity-80" style={{ backgroundColor: primaryColor, borderColor: primaryColor }} title={dict.common.print} aria-label={dict.common.print}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          </button>
                          {transaction.status === 'completed' && (
                            <button onClick={() => openAdjustModal(transaction)} className="px-3 py-2 bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-all duration-200 border border-orange-600 flex items-center justify-center touch-manipulation min-h-[44px] sm:min-h-0" title={dict.transactions?.adjust || 'Adjust / Refund'}>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
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

        {/* Transaction Detail Drawer */}
        {(selectedTransaction || selectedExpense) && (
          <div
            className="fixed inset-0 bg-gray-900/30 backdrop-blur-md z-50"
            onClick={() => { setSelectedTransaction(null); setSelectedExpense(null); }}
          >
            <div
              className="absolute inset-y-0 right-0 w-full max-w-md bg-white border-l border-gray-300 flex flex-col animate-slide-in-right"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                    {selectedTransaction ? dict.transactions.transactionDetails : (dict.transactions?.expenseDetails || 'Expense Details')}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    <FormattedDate
                      date={selectedTransaction ? selectedTransaction.createdAt : (selectedExpense!.date || selectedExpense!.createdAt)}
                      includeTime={true}
                    />
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedTransaction(null); setSelectedExpense(null); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
                {selectedTransaction ? (
                  <>
                    {/* Receipt & Status */}
                    <div className="flex items-center justify-between">
                      {selectedTransaction.receiptNumber && (
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5">{dict.transactions?.receipt || 'Receipt'}</div>
                          <div className="font-mono text-sm font-semibold text-gray-900">{selectedTransaction.receiptNumber}</div>
                        </div>
                      )}
                      <span className={`ml-auto inline-block px-2.5 py-1 text-xs font-semibold border ${
                        selectedTransaction.status === 'completed'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : selectedTransaction.status === 'refunded'
                          ? 'bg-brand-soft text-brand-navy border-teal-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                      }`}>
                        {selectedTransaction.status}
                      </span>
                    </div>

                    {/* Items */}
                    <div className="border border-gray-200 divide-y divide-gray-100">
                      {selectedTransaction.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              <Currency amount={item.price} /> × {item.quantity}
                            </div>
                          </div>
                          <div className="font-semibold text-gray-900 text-sm ml-4">
                            <Currency amount={item.subtotal} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="border border-gray-200 divide-y divide-gray-100">
                      {selectedTransaction.subtotal !== undefined && selectedTransaction.discountAmount && (
                        <div className="flex justify-between items-center px-4 py-2.5 text-sm text-gray-600">
                          <span>{dict.transactions?.subtotal || 'Subtotal'}</span>
                          <Currency amount={selectedTransaction.subtotal} />
                        </div>
                      )}
                      {selectedTransaction.discountAmount && (
                        <div className="flex justify-between items-center px-4 py-2.5 text-sm text-gray-600">
                          <span>
                            {dict.transactions?.discount || 'Discount'}
                            {selectedTransaction.discountCode && <span className="ml-1 font-mono text-xs bg-gray-100 px-1.5 py-0.5 border border-gray-200">{selectedTransaction.discountCode}</span>}
                          </span>
                          <span className="text-red-600">- <Currency amount={selectedTransaction.discountAmount} /></span>
                        </div>
                      )}
                      <div className="flex justify-between items-center px-4 py-3 font-bold">
                        <span className="text-base text-gray-900">{dict.common.total}</span>
                        <span className="text-lg" style={{ color: primaryColor }}>
                          <Currency amount={selectedTransaction.total} />
                        </span>
                      </div>
                    </div>

                    {/* Payment */}
                    <div className="border border-gray-200 divide-y divide-gray-100">
                      <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                        <span className="text-gray-500">{dict.transactions.payment}</span>
                        <span
                          className="inline-block px-2.5 py-1 text-xs font-medium border capitalize"
                          style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, borderColor: primaryColor }}
                        >
                          {dict.pos?.[selectedTransaction.paymentMethod] || selectedTransaction.paymentMethod}
                        </span>
                      </div>
                      {selectedTransaction.cashReceived && (
                        <div className="flex justify-between items-center px-4 py-2.5 text-sm text-gray-600">
                          <span>{dict.transactions.cash}</span>
                          <Currency amount={selectedTransaction.cashReceived} />
                        </div>
                      )}
                      {selectedTransaction.change !== undefined && selectedTransaction.change > 0 && (
                        <div className="flex justify-between items-center px-4 py-2.5 text-sm text-gray-600">
                          <span>{dict.transactions.change}</span>
                          <Currency amount={selectedTransaction.change} />
                        </div>
                      )}
                    </div>
                  </>
                ) : selectedExpense ? (
                  <>
                    {/* Expense badge */}
                    <div className="flex justify-end">
                      <span className="inline-block px-2.5 py-1 text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                        {dict.transactions?.expense || 'Expense'}
                      </span>
                    </div>

                    <div className="border border-gray-200 divide-y divide-gray-100">
                      <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                        <span className="text-gray-500">{dict.transactions?.name || 'Name'}</span>
                        <span className="font-semibold text-gray-900">{selectedExpense.name}</span>
                      </div>
                      {selectedExpense.description && (
                        <div className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                          <span className="text-gray-500">{dict.transactions?.description || 'Description'}</span>
                          <span className="text-gray-900">{selectedExpense.description}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                        <span className="text-gray-500">{dict.transactions.payment}</span>
                        <span className="inline-block px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 border border-red-300 capitalize">
                          {dict.pos?.[selectedExpense.paymentMethod] || selectedExpense.paymentMethod}
                        </span>
                      </div>
                      {selectedExpense.notes && (
                        <div className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                          <span className="text-gray-500">{dict.transactions?.notes || 'Notes'}</span>
                          <span className="text-gray-900">{selectedExpense.notes}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center px-4 py-3 font-bold">
                        <span className="text-base text-gray-900">{dict.common.total}</span>
                        <span className="text-lg text-red-600"><Currency amount={selectedExpense.amount} /></span>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Drawer Footer — actions */}
              {selectedTransaction && (
                <div className="border-t border-gray-200 p-5 sm:p-6 flex gap-2">
                  <button
                    onClick={() => printReceipt(selectedTransaction)}
                    className="flex-1 py-2.5 text-white transition-all duration-200 border flex items-center justify-center gap-2 hover:opacity-80 min-h-[44px] text-sm font-medium"
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    {dict.common.print}
                  </button>
                  {selectedTransaction.status === 'completed' && (
                    <button
                      onClick={() => { openAdjustModal(selectedTransaction); setSelectedTransaction(null); }}
                      className="flex-1 py-2.5 bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 transition-all duration-200 border border-orange-600 flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {dict.transactions?.adjust || 'Adjust'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Manual Expense Modal */}
        {showExpenseModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowExpenseModal(false); }}>
            <div className="bg-white w-full max-w-md border border-gray-300 shadow-xl my-6">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-red-50">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {dict.transactions?.addExpense || 'Add Expense'}
                </h2>
                <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-200 rounded transition-colors" aria-label="Close">
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {expenseSuccess ? (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{dict.transactions?.expenseCreated || 'Expense recorded successfully'}</p>
                  <button onClick={() => setShowExpenseModal(false)} className="mt-4 px-6 py-2 bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition-colors">
                    {dict.common?.close || 'Close'}
                  </button>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.name || 'Name'} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={expenseName}
                      onChange={(e) => setExpenseName(e.target.value)}
                      placeholder={dict.transactions?.expenseNamePlaceholder || 'e.g. Office supplies'}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.description || 'Description'} <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                      placeholder={dict.transactions?.expenseDescPlaceholder || 'Brief description of the expense'}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{dict.common?.amount || 'Amount'} <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.date || 'Date'}</label>
                      <input
                        type="date"
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.payment || 'Payment Method'}</label>
                    <div className="flex gap-0 border border-gray-300 bg-white w-full">
                      {(['cash', 'card', 'digital', 'other'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setExpensePayment(m)}
                          className={`flex-1 py-2 text-xs font-medium border-r border-gray-300 last:border-r-0 transition-colors ${expensePayment === m ? 'bg-red-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          {dict.pos?.[m] || m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.notes || 'Notes'} ({dict.common?.optional || 'optional'})</label>
                    <textarea
                      value={expenseNotes}
                      onChange={(e) => setExpenseNotes(e.target.value)}
                      rows={2}
                      placeholder={dict.transactions?.expenseNotesPlaceholder || 'Additional details…'}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  </div>

                  {expenseError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{expenseError}</div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowExpenseModal(false)}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 text-sm font-medium transition-colors"
                    >
                      {dict.common?.cancel || 'Cancel'}
                    </button>
                    <button
                      onClick={submitManualExpense}
                      disabled={expenseLoading || !expenseName.trim() || !expenseDescription.trim() || !expenseAmount}
                      className="flex-1 px-4 py-2.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed border border-red-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {expenseLoading ? (
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                      {dict.transactions?.saveExpense || 'Save Expense'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Manual Transaction Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
            <div className="bg-white w-full max-w-lg border border-gray-300 shadow-xl my-6">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-green-50">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {dict.transactions?.addManual || 'Add Manual Transaction'}
                </h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-200 rounded transition-colors" aria-label="Close">
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {manualSuccess ? (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <p className="text-base font-semibold text-gray-900">{dict.transactions?.transactionCreated || 'Transaction created successfully'}</p>
                  <button onClick={() => setShowAddModal(false)} className="mt-4 px-6 py-2 bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition-colors">
                    {dict.common?.close || 'Close'}
                  </button>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-5">
                  {/* Line items */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700">{dict.transactions?.items || 'Items'}</label>
                      <button
                        onClick={() => setManualItems((prev) => [...prev, emptyItem()])}
                        className="text-xs text-brand hover:text-brand-navy font-medium flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {dict.transactions?.addItem || 'Add item'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {manualItems.map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-start">
                          <input
                            type="text"
                            placeholder={dict.transactions?.itemName || 'Item name'}
                            value={item.name}
                            onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                            className="flex-1 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 min-w-0"
                          />
                          <input
                            type="number"
                            placeholder={dict.common?.price || 'Price'}
                            value={item.price}
                            min="0"
                            step="0.01"
                            onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, price: e.target.value } : it))}
                            className="w-24 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                          <input
                            type="number"
                            placeholder={dict?.customerDisplay?.qty || 'Qty'}
                            value={item.quantity}
                            min="1"
                            step="1"
                            onChange={(e) => setManualItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: e.target.value } : it))}
                            className="w-16 border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                          />
                          {manualItems.length > 1 && (
                            <button
                              onClick={() => setManualItems((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                              title={dict?.pos?.removeItem || 'Remove item'}
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Running total */}
                    {manualItems.some((it) => it.price && it.quantity) && (
                      <div className="mt-3 text-right text-sm text-gray-600">
                        {dict.common?.total || 'Total'}:{' '}
                        <span className="font-bold text-gray-900">
                          {manualItems.reduce((sum, it) => {
                            const p = parseFloat(it.price);
                            const q = parseInt(it.quantity, 10);
                            return sum + (isNaN(p) || isNaN(q) ? 0 : p * q);
                          }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment method */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.payment || 'Payment Method'}</label>
                    <div className="flex gap-0 border border-gray-300 bg-white w-full">
                      {(['cash', 'card', 'digital'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setManualPayment(m)}
                          className={`flex-1 py-2 text-sm font-medium border-r border-gray-300 last:border-r-0 transition-colors ${manualPayment === m ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                        >
                          {dict.pos?.[m] || m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cash received */}
                  {manualPayment === 'cash' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.cash || 'Cash Received'} ({dict.common?.optional || 'optional'})</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualCash}
                        onChange={(e) => setManualCash(e.target.value)}
                        placeholder="0.00"
                        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                      {manualCash && (() => {
                        const total = manualItems.reduce((s, it) => { const p = parseFloat(it.price); const q = parseInt(it.quantity, 10); return s + (isNaN(p)||isNaN(q)?0:p*q); }, 0);
                        const change = parseFloat(manualCash) - total;
                        return change >= 0 ? (
                          <p className="text-xs text-gray-500 mt-1">{dict.transactions?.change || 'Change'}: <span className="font-medium text-green-700">{change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                        ) : (
                          <p className="text-xs text-red-500 mt-1">{dict.transactions?.insufficientCash || 'Cash received is less than total'}</p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.transactions?.notes || 'Notes'} ({dict.common?.optional || 'optional'})</label>
                    <textarea
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      rows={2}
                      placeholder={dict.transactions?.notesPlaceholder || 'e.g. walk-in customer, special order…'}
                      className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                    />
                  </div>

                  {manualError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{manualError}</div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 text-sm font-medium transition-colors"
                    >
                      {dict.common?.cancel || 'Cancel'}
                    </button>
                    <button
                      onClick={submitManualTransaction}
                      disabled={manualLoading || manualItems.every((it) => !it.name)}
                      className="flex-1 px-4 py-2.5 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed border border-green-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {manualLoading ? (
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                      {dict.transactions?.saveTransaction || 'Save Transaction'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Adjustment / Refund Modal */}
        {adjustTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) closeAdjustModal(); }}>
            <div className="bg-white w-full max-w-md border border-gray-300 shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-orange-50">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {dict.transactions?.adjustRefund || 'Adjust / Refund Transaction'}
                </h2>
                <button onClick={closeAdjustModal} className="p-1 hover:bg-gray-200 rounded transition-colors" aria-label="Close">
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* Transaction summary */}
                <div className="bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dict.transactions.date}:</span>
                    <span className="font-medium text-gray-800"><FormattedDate date={adjustTransaction.createdAt} includeTime={true} /></span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dict.transactions.items}:</span>
                    <span className="font-medium text-gray-800">{adjustTransaction.items.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{dict.common.total}:</span>
                    <span className="font-bold text-brand"><Currency amount={adjustTransaction.total} /></span>
                  </div>
                </div>
                {!adjustSuccess ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict.transactions?.refundReason || 'Reason'} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={adjustReason}
                        onChange={(e) => setAdjustReason(e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="">{dict.transactions?.selectReason || '— Select a reason —'}</option>
                        <option value="customer_request">{dict.transactions?.reasonCustomerRequest || 'Customer request'}</option>
                        <option value="defective_item">{dict.transactions?.reasonDefectiveItem || 'Defective item'}</option>
                        <option value="wrong_item">{dict.transactions?.reasonWrongItem || 'Wrong item'}</option>
                        <option value="overcharge">{dict.transactions?.reasonOvercharge || 'Overcharge'}</option>
                        <option value="other">{dict.transactions?.reasonOther || 'Other'}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {dict.transactions?.refundNotes || 'Notes (optional)'}
                      </label>
                      <textarea
                        value={adjustNotes}
                        onChange={(e) => setAdjustNotes(e.target.value)}
                        rows={3}
                        placeholder={dict.transactions?.refundNotesPlaceholder || 'Additional details…'}
                        className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                      />
                    </div>
                    {adjustError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                        {adjustError}
                      </div>
                    )}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={closeAdjustModal}
                        className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 text-sm font-medium transition-colors"
                      >
                        {dict.common?.cancel || 'Cancel'}
                      </button>
                      <button
                        onClick={doRefund}
                        disabled={!adjustReason || adjustLoading}
                        className="flex-1 px-4 py-2.5 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed border border-orange-600 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {adjustLoading ? (
                          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                        )}
                        {dict.transactions?.processRefund || 'Process Refund'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <div className="mx-auto mb-3 flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                      <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <p className="text-base font-semibold text-gray-900">{dict.transactions?.refundSuccess || 'Refund processed successfully'}</p>
                    <p className="text-sm text-gray-500 mt-1">{dict.transactions?.stockRestored || 'Stock has been restored.'}</p>
                    <button onClick={closeAdjustModal} className="mt-4 px-6 py-2 bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition-colors">
                      {dict.common?.close || 'Close'}
                    </button>
                  </div>
                )}
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

