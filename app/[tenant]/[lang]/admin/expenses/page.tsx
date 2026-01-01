'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

interface Expense {
  _id: string;
  name: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: 'cash' | 'card' | 'digital' | 'other';
  receipt?: string;
  notes?: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
  } | string;
  createdAt: string;
}

export default function ExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    name: '',
  });
  const [expenseNames, setExpenseNames] = useState<string[]>([]);
  const { settings } = useTenantSettings();

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchExpenses();
  }, [lang, tenant]);

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startDate, filters.endDate, filters.name]);

  // Validate date range
  const handleDateFilterChange = (field: 'startDate' | 'endDate', value: string) => {
    if (field === 'endDate' && filters.startDate && value && new Date(filters.startDate) > new Date(value)) {
      setMessage({ type: 'error', text: dict?.common?.endDateAfterStartDate || 'End date must be after start date' });
      return;
    }
    if (field === 'startDate' && filters.endDate && value && new Date(value) > new Date(filters.endDate)) {
      setMessage({ type: 'error', text: dict?.common?.startDateBeforeEndDate || 'Start date must be before end date' });
      return;
    }
    setFilters({ ...filters, [field]: value });
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.name) params.append('name', filters.name);

      const res = await fetch(`/api/expenses?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setExpenses(data.data);
        // Extract unique expense names
        const uniqueNames = Array.from(new Set(data.data.map((e: Expense) => e.name))).sort() as string[];
        setExpenseNames(uniqueNames);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || dict?.common?.failedToFetchExpenses || 'Failed to fetch expenses' });
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      setMessage({ type: 'error', text: dict?.common?.failedToFetchExpenses || 'Failed to fetch expenses' });
    } finally {
      setLoading(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteExpense = async (expenseId: string) => {
    if (!dict) return;
    if (!confirm(dict.common?.deleteExpenseConfirm || dict.admin?.deleteExpenseConfirm || 'Are you sure you want to delete this expense?')) return;
    setDeletingId(expenseId);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || dict?.admin?.expenseDeletedSuccess || 'Expense deleted successfully' });
        fetchExpenses();
      } else {
        setMessage({ type: 'error', text: data.error || dict?.admin?.failedToDeleteExpense || 'Failed to delete expense' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: dict?.admin?.failedToDeleteExpense || 'Failed to delete expense' });
    } finally {
      setDeletingId(null);
    }
  };

  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

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
                {dict.admin?.expenses || 'Expenses'}
              </h1>
              <p className="text-gray-600">{dict.admin?.expensesSubtitle || 'Manage and track business expenses'}</p>
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
          <div className={`mb-6 p-4 border flex items-center justify-between ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-4 text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Summary Card */}
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-500">{dict.admin?.totalExpenses || 'Total Expenses'}</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                <Currency amount={totalAmount} />
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{dict.admin?.totalRecords || 'Total Records'}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-2">{expenses.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">{dict.admin?.expenses || 'Expenses'}</h2>
            <button
              onClick={() => {
                setEditingExpense(null);
                setShowExpenseModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
            >
              {dict.common?.add || 'Add'} {dict.admin?.expense || 'Expense'}
            </button>
          </div>

          {/* Filters */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">{dict.admin?.filters || 'Filters'}</h3>
              {(filters.startDate || filters.endDate || filters.name) && (
                <button
                  onClick={() => setFilters({ startDate: '', endDate: '', name: '' })}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {dict.common?.clearFilters || 'Clear Filters'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.startDate || 'Start Date'}
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.endDate || 'End Date'}
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.expenseName || 'Name of Expense'}
              </label>
              <select
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                <option value="">{dict.common?.all || 'All Names'}</option>
                {expenseNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.date || 'Date'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.expenseName || 'Name of Expense'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.description || 'Description'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.amount || 'Amount'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.paymentMethod || 'Payment Method'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.user || 'User'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {expenses.map((expense) => {
                  const userName = typeof expense.userId === 'object' && expense.userId !== null
                    ? expense.userId.name
                    : '-';
                  return (
                    <tr key={expense._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(expense.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="px-2 py-1 text-xs font-semibold border border-blue-300 bg-blue-100 text-blue-800">
                          {expense.name}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">{expense.description}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <Currency amount={expense.amount} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {expense.paymentMethod}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{userName}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingExpense(expense);
                              setShowExpenseModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            {dict.common?.edit || 'Edit'}
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense._id)}
                            disabled={deletingId === expense._id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingId === expense._id ? (dict.common?.deleting || 'Deleting...') : (dict.common?.delete || 'Delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {expenses.length === 0 && (
              <div className="text-center py-8 text-gray-500">{dict.common?.noResults || 'No expenses found'}</div>
            )}
          </div>
        </div>

        {showExpenseModal && (
          <ExpenseModal
            expense={editingExpense}
            onClose={() => {
              setShowExpenseModal(false);
              setEditingExpense(null);
            }}
            onSave={() => {
              fetchExpenses();
              setShowExpenseModal(false);
              setEditingExpense(null);
              setMessage({ type: 'success', text: editingExpense ? (dict?.common?.expenseUpdatedSuccess || 'Expense updated successfully') : (dict?.common?.expenseCreatedSuccess || 'Expense created successfully') });
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function ExpenseModal({
  expense,
  onClose,
  onSave,
  dict,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSave: () => void;
  dict: any;
}) {
  const getInitialFormData = () => ({
    name: expense?.name || '',
    description: expense?.description || '',
    amount: expense?.amount?.toString() || '',
    date: expense?.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    paymentMethod: expense?.paymentMethod || 'cash',
    receipt: expense?.receipt || '',
    notes: expense?.notes || '',
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form when expense changes (for edit mode)
  useEffect(() => {
    setFormData({
      name: expense?.name || '',
      description: expense?.description || '',
      amount: expense?.amount?.toString() || '',
      date: expense?.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      paymentMethod: expense?.paymentMethod || 'cash',
      receipt: expense?.receipt || '',
      notes: expense?.notes || '',
    });
    setError('');
  }, [expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!formData.name?.trim()) {
      setError('Name of expense is required');
      return;
    }
    
    if (!formData.description?.trim()) {
      setError('Description is required');
      return;
    }
    
    if (!formData.amount || formData.amount === '') {
      setError('Amount is required');
      return;
    }
    
    const amountValue = parseFloat(formData.amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    
    if (!formData.date) {
      setError('Date is required');
      return;
    }

    setSaving(true);
    try {
      const url = expense ? `/api/expenses/${expense._id}` : '/api/expenses';
      const method = expense ? 'PUT' : 'POST';
      const body = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        amount: amountValue,
        date: formData.date,
        paymentMethod: formData.paymentMethod,
        receipt: formData.receipt?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        // Reset form on success
        setFormData({
          name: '',
          description: '',
          amount: '',
          date: new Date().toISOString().split('T')[0],
          paymentMethod: 'cash',
          receipt: '',
          notes: '',
        });
        setError('');
        onSave();
      } else {
        setError(data.error || 'Failed to save expense');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {expense ? (dict.admin?.editExpense || 'Edit Expense') : (dict.admin?.addExpense || 'Add Expense')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.expenseName || 'Name of Expense'} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={dict.admin?.expenseNamePlaceholder || 'Enter expense name (e.g., Office Supplies, Rent, Utilities)'}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.amount || 'Amount'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty, numbers, and one decimal point
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setFormData({ ...formData, amount: value });
                    }
                  }}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'} *
              </label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder={dict?.admin?.expenseDescriptionPlaceholder || 'Enter expense description'}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.date || 'Date'} *
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.paymentMethod || 'Payment Method'} *
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="digital">Digital</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.receipt || 'Receipt'} (optional)
              </label>
              <input
                type="text"
                value={formData.receipt}
                onChange={(e) => setFormData({ ...formData, receipt: e.target.value })}
                placeholder={dict?.admin?.receiptURLPlaceholder || 'Receipt URL or reference'}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.notes || 'Notes'} (optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

