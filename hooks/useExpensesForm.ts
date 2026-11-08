'use client';

import { useState, useCallback } from 'react';
import { Expense } from './useExpensesList';
import { type TranslationDict } from '@/types/dictionary';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getTenantDateString } from '@/lib/timezone';
import { expenseDayString } from '@/lib/expense-date';

export interface ExpenseFormData {
  name: string;
  description: string;
  amount: string;
  date: string;
  paymentMethod: 'cash' | 'card' | 'digital' | 'other';
  receipt: string;
  notes: string;
}

interface UseExpensesFormReturn {
  formData: ExpenseFormData;
  setFormData: (data: Partial<ExpenseFormData>) => void;
  error: string;
  submitting: boolean;
  handleSubmit: (onSubmit: (data: ExpenseFormData) => Promise<true | string>) => Promise<void>;
  resetForm: () => void;
  initializeForm: (expense: Expense) => void;
}

// Today at the store (not the UTC day: before 08:00 in Manila that was yesterday),
// worked out when the form opens rather than when the module loaded.
const emptyForm = (timeZone?: string): ExpenseFormData => ({
  name: '',
  description: '',
  amount: '',
  date: getTenantDateString(timeZone),
  paymentMethod: 'cash',
  receipt: '',
  notes: '',
});

export function useExpensesForm(dict?: TranslationDict | null): UseExpensesFormReturn {
  const { settings } = useTenantSettings();
  const timeZone = settings?.timezone;
  const [formData, setFormDataState] = useState<ExpenseFormData>(() => emptyForm(timeZone));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const t = (key: string, fallback: string) => dict?.validation?.[key] || fallback;

  const setFormData = useCallback((data: Partial<ExpenseFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormDataState(emptyForm(timeZone));
    setError('');
  }, [timeZone]);

  const initializeForm = useCallback((expense: Expense) => {
    setFormDataState({
      name: expense.name,
      description: expense.description,
      amount: expense.amount.toString(),
      date: expenseDayString(expense.date, timeZone),
      paymentMethod: expense.paymentMethod,
      receipt: expense.receipt || '',
      notes: expense.notes || '',
    });
    setError('');
  }, [timeZone]);

  const handleSubmit = useCallback(
    async (onSubmit: (data: ExpenseFormData) => Promise<true | string>) => {
      setError('');

      // Validate required fields
      if (!formData.name?.trim()) {
        setError(t('expenseNameRequired', 'Name of expense is required'));
        return;
      }
      if (!formData.description?.trim()) {
        setError(t('descriptionRequired', 'Description is required'));
        return;
      }
      if (!formData.amount || formData.amount === '') {
        setError(t('amountRequired', 'Amount is required'));
        return;
      }

      const amountValue = parseFloat(formData.amount);
      if (isNaN(amountValue) || amountValue <= 0) {
        setError(t('amountPositive', 'Amount must be a valid positive number'));
        return;
      }

      if (!formData.date) {
        setError(t('expenseDateRequired', 'Date is required'));
        return;
      }

      setSubmitting(true);
      try {
        const payload: ExpenseFormData = {
          name: formData.name.trim(),
          description: formData.description.trim(),
          amount: amountValue.toString(),
          date: formData.date,
          paymentMethod: formData.paymentMethod,
          receipt: formData.receipt?.trim() || '',
          notes: formData.notes?.trim() || '',
        };

        const result = await onSubmit(payload);
        if (result !== true) {
          setError(result);
        }
      } catch {
        setError(dict?.common?.errorWhileSaving || 'An error occurred while saving');
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` is derived purely from `dict`, already listed
    [formData, dict]
  );

  return {
    formData,
    setFormData,
    error,
    submitting,
    handleSubmit,
    resetForm,
    initializeForm,
  };
}
