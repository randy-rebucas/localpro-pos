'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { showToast } from '@/lib/toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useExpensesList, type Expense } from '@/hooks/useExpensesList';
import { useExpensesForm, type ExpenseFormData } from '@/hooks/useExpensesForm';
import {
  getPaymentMethodLabel,
  formatDate,
  validateDateRange,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getDateValidationError,
} from '@/lib/expenses-helpers';

const ICON_BUTTON = 'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';

export default function ExpensesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  // Remounts the form on every open so it re-initializes even when reopening the same expense.
  const [formKey, setFormKey] = useState(0);
  const { canAccess } = usePermissions();
  const canCreate = canAccess('expenses.create');
  const canEdit = canAccess('expenses.edit');
  const canDelete = canAccess('expenses.delete');
  const showRowActions = canEdit || canDelete;

  const {
    expenses,
    loading,
    error,
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

  // List-level feedback goes to toasts.
  useEffect(() => {
    if (!message) return;
    if (message.type === 'success') showToast.success(message.text);
    else showToast.error(message.text);
    setMessage(null);
  }, [message, setMessage]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  // fetchExpenses is rebuilt whenever filters change, so this also refetches on filter changes.
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses, tenant]);

  const handleDateFilterChange = (field: 'startDate' | 'endDate', value: string) => {
    const newFilters = { ...filters, [field]: value };
    const validation = validateDateRange(newFilters.startDate, newFilters.endDate);
    if (!validation.valid) {
      setMessage({ type: 'error', text: getDateValidationError(field, dict) });
      return;
    }
    setFilters(newFilters);
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!dict) return;
    if (!confirm(getDeleteConfirmMessage(dict, expense.name))) return;

    setDeletingId(expense._id);
    const success = await deleteExpense(expense._id);
    setDeletingId(null);

    if (success) {
      setMessage({ type: 'success', text: getDeleteSuccessMessage(dict) });
      await fetchExpenses();
    } else {
      setMessage({ type: 'error', text: getDeleteErrorMessage(dict) });
    }
  };

  const openForm = (expense: Expense | null) => {
    setEditingExpense(expense);
    setFormKey((k) => k + 1);
    setShowExpenseModal(true);
  };

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const hasFilters = !!(filters.startDate || filters.endDate || filters.name);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingExpenses || 'Loading expenses…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchExpenses()}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (expenses.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noExpensesMatch || 'No expenses match your filters.')
            : (dict.admin?.noExpensesYet || 'No expenses yet.')}
        </div>
      );
    }

    const editLabel = dict.common?.edit || 'Edit';
    const deleteLabel = dict.common?.delete || 'Delete';

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.date || 'Date'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.expenseName || 'Name of Expense'}</th>
              <th className="px-4 py-3 text-right font-medium">{dict.admin?.amount || 'Amount'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.paymentMethod || 'Payment Method'}</th>
              <th className="px-4 py-3 text-left font-medium">{dict.admin?.user || 'User'}</th>
              {showRowActions && <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {expenses.map((expense) => {
              const userName = typeof expense.userId === 'object' && expense.userId !== null ? expense.userId.name : '—';
              const deleting = deletingId === expense._id;
              return (
                <tr key={expense._id} className="hover:bg-gray-100 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 tabular-nums">{formatDate(expense.date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{expense.name}</p>
                    {expense.description && (
                      <p className="text-xs text-gray-500 max-w-[320px] truncate" title={expense.description}>{expense.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-semibold text-gray-900">
                    <Currency amount={expense.amount} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{getPaymentMethodLabel(expense.paymentMethod, dict)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">{userName}</td>
                  {showRowActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canEdit && (<button
                          type="button"
                          onClick={() => openForm(expense)}
                          title={editLabel}
                          aria-label={`${editLabel}: ${expense.name}`}
                          className={`${ICON_BUTTON} bg-brand`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
                          </svg>
                        </button>)}
                        {canDelete && (<button
                          type="button"
                          onClick={() => handleDeleteExpense(expense)}
                          disabled={deleting}
                          title={deleteLabel}
                          aria-label={`${deleteLabel}: ${expense.name}`}
                          className={`${ICON_BUTTON} bg-win8-danger`}
                        >
                          {deleting ? (
                            <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z" />
                            </svg>
                          )}
                        </button>)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.expenses || 'Expenses'}
          description={dict.admin?.expensesSubtitle || 'Manage and track business expenses'}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {dict.admin?.totalExpenses || 'Total Expenses'}
              </p>
              <p className="text-3xl font-bold tabular-nums text-win8-danger mt-1.5">
                {loading ? '—' : <Currency amount={totalAmount} />}
              </p>
            </div>
            <div className="bg-white border border-gray-300 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight">
                {dict.admin?.totalRecords || 'Total Records'}
              </p>
              <p className="text-3xl font-bold tabular-nums text-gray-900 mt-1.5">
                {loading ? '—' : expenses.length.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white border border-gray-300 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="expenses-start" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.startDate || 'Start Date'}
              </label>
              <input
                id="expenses-start"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white"
              />
            </div>
            <div>
              <label htmlFor="expenses-end" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.endDate || 'End Date'}
              </label>
              <input
                id="expenses-end"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                className="px-3 py-2 border border-gray-300 text-sm bg-white"
              />
            </div>
            <div>
              <label htmlFor="expenses-name" className="block text-xs font-medium text-gray-600 mb-1">
                {dict.admin?.expenseName || 'Name of Expense'}
              </label>
              <select
                id="expenses-name"
                value={filters.name}
                onChange={(e) => setFilters({ ...filters, name: e.target.value })}
                className="px-3 py-2 border border-gray-300 text-sm bg-white w-48"
              >
                <option value="">{dict.common?.all || 'All Names'}</option>
                {expenseNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={() => setFilters({ startDate: '', endDate: '', name: '' })}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                {dict.common?.clearFilters || 'Clear Filters'}
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => openForm(null)}
                className="ml-auto px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors"
              >
                + {dict.admin?.addExpense || 'Add Expense'}
              </button>
            )}
          </div>

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showExpenseModal} onClose={() => setShowExpenseModal(false)} widthClass="max-w-2xl">
        <ExpenseForm
          key={formKey}
          expense={editingExpense}
          onClose={() => setShowExpenseModal(false)}
          onSave={async () => {
            await fetchExpenses();
            setShowExpenseModal(false);
            setMessage({ type: 'success', text: editingExpense ? (dict?.common?.expenseUpdatedSuccess || 'Expense updated successfully') : (dict?.common?.expenseCreatedSuccess || 'Expense created successfully') });
          }}
          dict={dict}
          createExpense={createExpense}
          updateExpense={updateExpense}
        />
      </Win8Drawer>
    </>
  );
}

function ExpenseForm({
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
  dict: TranslationDict | null;
  createExpense: (form: ExpenseFormData) => Promise<true | string>;
  updateExpense: (id: string, form: ExpenseFormData) => Promise<true | string>;
}) {
  const { formData, setFormData, error, submitting, handleSubmit, initializeForm, resetForm } = useExpensesForm(dict);

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
      const result = isEdit ? await updateExpense(expense._id, payload) : await createExpense(payload);
      if (result === true) {
        await onSave();
      }
      return result;
    });
  };

  const inputClass = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';
  const required = <span className="text-win8-danger">*</span>;
  const optional = <span className="text-gray-400 font-normal">({dict?.common?.optional || 'optional'})</span>;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {expense ? (dict?.admin?.editExpense || 'Edit Expense') : (dict?.admin?.addExpense || 'Add Expense')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          title={dict?.common?.close || 'Close'}
          aria-label={dict?.common?.close || 'Close'}
          className="text-white/70 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form onSubmit={onFormSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="expense-name" className={labelClass}>{dict?.admin?.expenseName || 'Name of Expense'} {required}</label>
              <input
                id="expense-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ name: e.target.value })}
                placeholder={dict?.admin?.expenseNamePlaceholder || 'Enter expense name (e.g., Office Supplies, Rent, Utilities)'}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="expense-amount" className={labelClass}>{dict?.admin?.amount || 'Amount'} {required}</label>
              <input
                id="expense-amount"
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
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="expense-description" className={labelClass}>{dict?.admin?.description || 'Description'} {required}</label>
            <textarea
              id="expense-description"
              required
              value={formData.description}
              onChange={(e) => setFormData({ description: e.target.value })}
              rows={2}
              placeholder={dict?.admin?.expenseDescriptionPlaceholder || 'Enter expense description'}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="expense-date" className={labelClass}>{dict?.admin?.date || 'Date'} {required}</label>
              <input
                id="expense-date"
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ date: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="expense-method" className={labelClass}>{dict?.admin?.paymentMethod || 'Payment Method'} {required}</label>
              <select
                id="expense-method"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ paymentMethod: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                className={inputClass}
                required
              >
                <option value="cash">{dict?.admin?.cash || 'Cash'}</option>
                <option value="card">{dict?.admin?.card || 'Card'}</option>
                <option value="digital">{dict?.admin?.digital || 'Digital'}</option>
                <option value="other">{dict?.admin?.other || 'Other'}</option>
              </select>
            </div>
          </div>
          <hr className="border-gray-300" />
          <div>
            <label htmlFor="expense-receipt" className={labelClass}>{dict?.admin?.receipt || 'Receipt'} {optional}</label>
            <input
              id="expense-receipt"
              type="text"
              value={formData.receipt}
              onChange={(e) => setFormData({ receipt: e.target.value })}
              placeholder={dict?.admin?.receiptURLPlaceholder || 'Receipt URL or reference'}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="expense-notes" className={labelClass}>{dict?.admin?.notes || 'Notes'} {optional}</label>
            <textarea
              id="expense-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ notes: e.target.value })}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 transition-colors"
          >
            {dict?.common?.cancel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors"
          >
            {submitting ? (dict?.common?.saving || 'Saving…') : (dict?.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
