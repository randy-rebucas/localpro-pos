'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { useExpensesList, type Expense, type ExpenseFilters } from '@/hooks/useExpensesList';
import { useExpensesForm } from '@/hooks/useExpensesForm';
import {
  getPaymentMethodLabel,
  formatDate,
  validateDateRange,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getSaveSuccessMessage,
  getSaveErrorMessage,
  getDateValidationError,
  getExpenseNameBadgeClass,
} from '@/lib/expenses-helpers';

export default function ExpensesPage() {
  const params = useParams();
  const router = useRouter(); // eslint-disable-line @typescript-eslint/no-unused-vars
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const {
    expenses,
    loading,
    message,
    filters,
    expenseNames,
    deletingId,
    totalAmount,
    setFilters,
    setMessage,
    fetchExpenses,
    deleteExpense,
    createExpense,
    updateExpense,
    setDeletingId,
  } = useExpensesList();

  const { settings } = useTenantSettings(); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Auto-dismiss messages after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message, setMessage]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchExpenses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  // Validate date range
  const handleDateFilterChange = (field: 'startDate' | 'endDate', value: string) => {
    const newFilters = { ...filters, [field]: value };
    const validation = validateDateRange(newFilters.startDate, newFilters.endDate);
    if (!validation.valid) {
      setMessage({ type: 'error', text: getDateValidationError(field, dict) });
      return;
    }
    setFilters(newFilters);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!dict) return;
    if (!confirm(getDeleteConfirmMessage(dict))) return;

    setDeletingId(expenseId);
    const success = await deleteExpense(expenseId);
    setDeletingId(null);

    if (success) {
      setMessage({ type: 'success', text: getDeleteSuccessMessage(dict) });
      await fetchExpenses();
    } else {
      setMessage({ type: 'error', text: getDeleteErrorMessage(dict) });
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
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.expenses || 'Expenses'}
              </h1>
              <p className="text-gray-600">{dict.admin?.expensesSubtitle || 'Manage and track business expenses'}</p>
            </div>
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
                        {formatDate(expense.date)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={getExpenseNameBadgeClass()}>
                          {expense.name}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">{expense.description}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <Currency amount={expense.amount} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {getPaymentMethodLabel(expense.paymentMethod, dict)}
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
            onSave={async () => {
              await fetchExpenses();
              setShowExpenseModal(false);
              setEditingExpense(null);
              setMessage({ type: 'success', text: editingExpense ? (dict?.common?.expenseUpdatedSuccess || 'Expense updated successfully') : (dict?.common?.expenseCreatedSuccess || 'Expense created successfully') });
            }}
            dict={dict}
            createExpense={createExpense}
            updateExpense={updateExpense}
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
  createExpense,
  updateExpense,
}: {
  expense: Expense | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  createExpense: (form: any) => Promise<boolean>;
  updateExpense: (id: string, form: any) => Promise<boolean>;
}) {
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } = useExpensesForm();

  useEffect(() => {
    if (expense) {
      initializeForm(expense);
    } else {
      resetForm();
    }
  }, [expense, initializeForm, resetForm]);

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit(async (payload) => {
      const isEdit = !!expense;
      const success = isEdit ? await updateExpense(expense._id, payload) : await createExpense(payload);
      if (success) {
        await onSave();
      }
      return success;
    });
  };


  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {expense ? (dict.admin?.editExpense || 'Edit Expense') : (dict.admin?.addExpense || 'Add Expense')}
          </h2>
          <form onSubmit={onFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.expenseName || 'Name of Expense'} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ name: e.target.value })}
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
                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                      setFormData({ amount: value });
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
                  onChange={(e) => setFormData({ description: e.target.value })}
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
                  onChange={(e) => setFormData({ date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.paymentMethod || 'Payment Method'} *
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ paymentMethod: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
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
                onChange={(e) => setFormData({ receipt: e.target.value })}
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
                onChange={(e) => setFormData({ notes: e.target.value })}
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
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {submitting ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

