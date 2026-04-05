'use client';

import { useEffect } from 'react';
import { useExpensesForm, type ExpenseFormData } from '@/hooks/useExpensesForm';
import { type Expense } from '@/hooks/useExpensesList';
import { type TranslationDict } from '@/types/dictionary';

interface ExpenseModalProps {
  expense: Expense | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  dict: TranslationDict | null;
  createExpense: (form: ExpenseFormData) => Promise<boolean>;
  updateExpense: (id: string, form: ExpenseFormData) => Promise<boolean>;
}

export function ExpenseModal({
  expense,
  onClose,
  onSave,
  dict,
  createExpense,
  updateExpense,
}: ExpenseModalProps) {
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } =
    useExpensesForm();

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
      const success = isEdit
        ? await updateExpense(expense._id, payload)
        : await createExpense(payload);
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
            {expense
              ? dict?.admin?.editExpense || 'Edit Expense'
              : dict?.admin?.addExpense || 'Add Expense'}
          </h2>
          <form onSubmit={onFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.expenseName || 'Name of Expense'} *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ name: e.target.value })}
                  placeholder={
                    dict?.admin?.expenseNamePlaceholder ||
                    'Enter expense name (e.g., Office Supplies, Rent, Utilities)'
                  }
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.amount || 'Amount'} *
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
                {dict?.admin?.description || 'Description'} *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ description: e.target.value })}
                rows={2}
                placeholder={
                  dict?.admin?.expenseDescriptionPlaceholder ||
                  'Enter expense description'
                }
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict?.admin?.date || 'Date'} *
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
                  {dict?.admin?.paymentMethod || 'Payment Method'} *
                </label>
                <select
                  value={formData.paymentMethod}
                  onChange={(e) =>
                    setFormData({
                      paymentMethod: e.target.value as
                        | 'cash'
                        | 'card'
                        | 'digital'
                        | 'other',
                    })
                  }
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
                {dict?.admin?.receipt || 'Receipt'} (optional)
              </label>
              <input
                type="text"
                value={formData.receipt}
                onChange={(e) => setFormData({ receipt: e.target.value })}
                placeholder={dict?.admin?.receiptURLPlaceholder || 'Receipt URL or reference'}
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
                {dict?.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {submitting
                  ? dict?.common?.loading || 'Saving...'
                  : dict?.common?.save || 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
