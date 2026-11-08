'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import { type TranslationDict } from '@/types/dictionary';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { ReceiptRow } from '@/components/marketing/primitives';
import {
  ICON, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, DARK_LABEL, INPUT, KEY, KEY_PRIMARY, LABEL, ROW_KEY,
  LedReadout, RegisterPage, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useExpensesList, type Expense } from '@/hooks/useExpensesList';
import { useExpensesForm, type ExpenseFormData } from '@/hooks/useExpensesForm';
import { useConfirm } from '@/lib/confirm';
import {
  getPaymentMethodLabel,
  formatDate,
  validateDateRange,
  getDeleteConfirmMessage,
  getDeleteSuccessMessage,
  getDeleteErrorMessage,
  getDateValidationError,
  getSaveSuccessMessage,
} from '@/lib/expenses-helpers';

const PAYMENT_METHODS: ExpenseFormData['paymentMethod'][] = ['cash', 'card', 'digital', 'other'];

const TH = 'px-3 py-2 align-bottom font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-3 py-3 font-receipt text-sm';
/** Cells holding written words rather than printed figures. */
const TD_TEXT = 'px-3 py-3 text-sm';

function MethodTag({ dict, method }: { dict: TranslationDict; method: string }) {
  return (
    <span className="inline-block whitespace-nowrap border border-ink/25 px-1.5 py-0.5 font-receipt text-[11px] uppercase text-ink/70">
      {getPaymentMethodLabel(method, dict)}
    </span>
  );
}

const userName = (expense: Expense) =>
  typeof expense.userId === 'object' && expense.userId !== null ? expense.userId.name : '';

export default function ExpensesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const { canAccess } = usePermissions();
  const canManage = canAccess('expenses.manage');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  const {
    expenses,
    loading,
    message,
    filters,
    expenseNames,
    deletingId,
    totalAmount,
    truncated,
    setFilters,
    setMessage,
    fetchExpenses,
    deleteExpense,
    createExpense,
    updateExpense,
    setDeletingId,
  } = useExpensesList();

  const { settings } = useTenantSettings();
  const timeZone = settings?.timezone || 'Asia/Manila';

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
  }, [lang]);

  // fetchExpenses changes with the filters, so this refetches whenever a filter changes.
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
    const confirmed = await confirm(
      dict.admin?.deleteExpenseTitle || 'Delete expense?',
      `${getDeleteConfirmMessage(dict)} (${expense.name})`,
      { variant: 'danger', confirmText: dict.common?.delete || 'Delete', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

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
    setShowExpenseModal(true);
  };

  // Show the spinner only for the first load, so refetches after a save or delete keep the page (and any open sheet) mounted.
  const [loadedOnce, setLoadedOnce] = useState(false);
  if (!loading && !loadedOnce) setLoadedOnce(true);

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.expenses || 'Expenses';
  const filtered = !!(filters.startDate || filters.endDate || filters.name);
  const editLabel = dict.common?.edit || 'Edit';
  const deleteLabel = dict.common?.delete || 'Delete';

  return (
    <RegisterPage
      tagNo="EX"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.admin?.expensesSubtitle || 'Manage and track business expenses'}
      side={<LedReadout value={expenses.length} label={dict.admin?.totalRecords || 'Total Records'} />}
    >
      {confirmDialog}

      {message && (
        <div className="mt-6">
          <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
        </div>
      )}

      {truncated && (
        <div className="mt-6">
          <Strip tone="error">
            {dict.admin?.expensesTruncated || 'Showing the latest 1,000 expenses, so the total is incomplete. Narrow the date range.'}
          </Strip>
        </div>
      )}

      {/* Which paid-outs to list, and the key to record a new one */}
      <div className="mt-6 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
        <div>
          <label htmlFor="expense-start" className={DARK_LABEL}>{dict.admin?.startDate || 'Start Date'}</label>
          <input
            id="expense-start"
            type="date"
            value={filters.startDate}
            onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
            className={DARK_FIELD}
          />
        </div>
        <div>
          <label htmlFor="expense-end" className={DARK_LABEL}>{dict.admin?.endDate || 'End Date'}</label>
          <input
            id="expense-end"
            type="date"
            value={filters.endDate}
            onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
            className={DARK_FIELD}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="expense-name" className={DARK_LABEL}>{dict.admin?.expenseName || 'Name of Expense'}</label>
          <select
            id="expense-name"
            value={filters.name}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            className={DARK_FIELD}
          >
            <option value="">{dict.common?.all || 'All'}</option>
            {expenseNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        {filtered ? (
          <button type="button" onClick={() => setFilters({ startDate: '', endDate: '', name: '' })} className={DARK_KEY}>
            {dict.common?.clearFilters || 'Clear Filters'}
          </button>
        ) : (
          <span className="hidden lg:block" aria-hidden />
        )}
        {canManage && (
          <button type="button" onClick={() => openForm(null)} className={DARK_KEY_PRIMARY}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.addExpense || 'Add Expense'}
          </button>
        )}
      </div>

      {/* The paid-out log, totalled at the foot like a till roll */}
      <section className="mt-6" aria-busy={loading}>
        <div className={`bg-paper-white text-ink transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {expenses.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <ReceiptText className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">{dict.admin?.noExpenses || 'No expenses found'}</p>
              {canManage && !filtered && (
                <button type="button" onClick={() => openForm(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addExpense || 'Add Expense'}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Up to xl: stacked lines */}
              <ul className="divide-y divide-dashed divide-ink/20 xl:hidden">
                {expenses.map((expense) => (
                  <li key={expense._id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium">{expense.name}</p>
                        <p className="shrink-0 font-receipt text-base font-semibold"><Currency amount={expense.amount} /></p>
                      </div>
                      {expense.description && <p className="mt-0.5 text-sm text-ink/70">{expense.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
                        <span>{formatDate(expense.date, timeZone, lang)}</span>
                        <MethodTag dict={dict} method={expense.paymentMethod} />
                        {userName(expense) && <span>{userName(expense)}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="-mr-2 flex shrink-0">
                        <button type="button" onClick={() => openForm(expense)} className={ROW_KEY} aria-label={`${editLabel} ${expense.name}`} title={editLabel}>
                          <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense)}
                          disabled={deletingId === expense._id}
                          className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`}
                          aria-label={`${deleteLabel} ${expense.name}`}
                          title={deleteLabel}
                        >
                          <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* From xl: the full log */}
              <div className="relative hidden overflow-x-auto xl:block" role="region" aria-label={title} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.date || 'Date'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.expenseName || 'Name of Expense'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.description || 'Description'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.paymentMethod || 'Payment Method'}</th>
                      <th scope="col" className={`${TH} text-left`}>{dict.admin?.user || 'User'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.amount || 'Amount'}</th>
                      {canManage && <th scope="col" className={TH}><span className="sr-only">{dict.common?.actions || 'Actions'}</span></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {expenses.map((expense) => (
                      <tr key={expense._id} className="align-top transition-colors hover:bg-paper">
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{formatDate(expense.date, timeZone, lang)}</td>
                        <td className={`${TD_TEXT} font-medium`}>{expense.name}</td>
                        <td className={`${TD_TEXT} max-w-sm text-ink/70`}>{expense.description || '-'}</td>
                        <td className={TD}><MethodTag dict={dict} method={expense.paymentMethod} /></td>
                        <td className={`${TD} whitespace-nowrap text-ink/70`}>{userName(expense) || '-'}</td>
                        <td className={`${TD} whitespace-nowrap text-right font-semibold`}><Currency amount={expense.amount} /></td>
                        {canManage && (
                          <td className="whitespace-nowrap px-2 py-1 text-right">
                            <div className="inline-flex">
                              <button type="button" onClick={() => openForm(expense)} className={ROW_KEY} aria-label={`${editLabel} ${expense.name}`} title={editLabel}>
                                <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(expense)}
                                disabled={deletingId === expense._id}
                                className={`${ROW_KEY} hover:text-stamp disabled:opacity-40`}
                                aria-label={`${deleteLabel} ${expense.name}`}
                                title={deleteLabel}
                              >
                                <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-dashed border-ink/30 px-4 py-4 font-receipt text-lg">
                <ReceiptRow strong label={dict.admin?.totalExpenses || 'Total Expenses'} value={<Currency amount={totalAmount} />} />
              </div>
            </>
          )}
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </section>

      {showExpenseModal && (
        <ExpenseSheet
          expense={editingExpense}
          onClose={() => {
            setShowExpenseModal(false);
            setEditingExpense(null);
          }}
          onSave={async () => {
            await fetchExpenses();
            setShowExpenseModal(false);
            setEditingExpense(null);
            setMessage({ type: 'success', text: getSaveSuccessMessage(!!editingExpense, dict) });
          }}
          dict={dict}
          createExpense={createExpense}
          updateExpense={updateExpense}
        />
      )}
    </RegisterPage>
  );
}

/** The paid-out voucher: what went out of the till, how, and when. */
function ExpenseSheet({
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
  dict: TranslationDict;
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
      const result = expense ? await updateExpense(expense._id, payload) : await createExpense(payload);
      if (result === true) {
        await onSave();
      }
      return result;
    });
  };

  const optional = dict.common?.optional || 'optional';

  return (
    <Sheet
      wide
      title={expense ? (dict.admin?.editExpense || 'Edit Expense') : (dict.admin?.addExpense || 'Add Expense')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>{dict.common?.cancel || 'Cancel'}</button>
          <button type="submit" form="expense-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict.common?.saving || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="expense-form" onSubmit={onFormSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-form-name" className={LABEL}>{dict.admin?.expenseName || 'Name of Expense'} *</label>
            <input
              id="expense-form-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              placeholder={dict.admin?.expenseNamePlaceholder || 'Enter expense name (e.g., Office Supplies, Rent, Utilities)'}
              className={INPUT}
              required
            />
          </div>
          <div>
            <label htmlFor="expense-form-amount" className={LABEL}>{dict.admin?.amount || 'Amount'} *</label>
            <input
              id="expense-form-amount"
              type="number"
              inputMode="decimal"
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
              className={`${INPUT} font-receipt`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="expense-form-description" className={LABEL}>{dict.admin?.description || 'Description'} *</label>
          <textarea
            id="expense-form-description"
            required
            value={formData.description}
            onChange={(e) => setFormData({ description: e.target.value })}
            rows={2}
            placeholder={dict.admin?.expenseDescriptionPlaceholder || 'Enter expense description'}
            className={INPUT}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-form-date" className={LABEL}>{dict.admin?.date || 'Date'} *</label>
            <input
              id="expense-form-date"
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ date: e.target.value })}
              className={INPUT}
            />
          </div>
          <fieldset>
            <legend className={LABEL}>{dict.admin?.paymentMethod || 'Payment Method'} *</legend>
            <div className="grid grid-cols-2 border-l border-t border-ink/25 sm:grid-cols-4">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={formData.paymentMethod === method}
                  onClick={() => setFormData({ paymentMethod: method })}
                  className={`flex min-h-[44px] items-center justify-center border-b border-r border-ink/25 px-1 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${formData.paymentMethod === method ? 'bg-ink text-paper-white' : 'text-ink hover:bg-paper'}`}
                >
                  {getPaymentMethodLabel(method, dict)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <label htmlFor="expense-form-receipt" className={LABEL}>{dict.admin?.receipt || 'Receipt'} ({optional})</label>
          <input
            id="expense-form-receipt"
            type="text"
            value={formData.receipt}
            onChange={(e) => setFormData({ receipt: e.target.value })}
            placeholder={dict.admin?.receiptURLPlaceholder || 'Receipt URL or reference'}
            className={INPUT}
          />
        </div>

        <div>
          <label htmlFor="expense-form-notes" className={LABEL}>{dict.admin?.notes || 'Notes'} ({optional})</label>
          <textarea
            id="expense-form-notes"
            value={formData.notes}
            onChange={(e) => setFormData({ notes: e.target.value })}
            rows={3}
            className={INPUT}
          />
        </div>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
