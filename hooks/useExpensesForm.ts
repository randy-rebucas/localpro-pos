'use client';

import { useState, useCallback, useEffect } from 'react';
import { Expense } from './useExpensesList';

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
  handleSubmit: (onSubmit: (data: any) => Promise<boolean>) => Promise<void>;
  resetForm: () => void;
  initializeForm: (expense: Expense) => void;
}

const emptyForm: ExpenseFormData = {
  name: '',
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  paymentMethod: 'cash',
  receipt: '',
  notes: '',
};

export function useExpensesForm(): UseExpensesFormReturn {
  const [formData, setFormDataState] = useState<ExpenseFormData>(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setFormData = useCallback((data: Partial<ExpenseFormData>) => {
    setFormDataState(prev => ({ ...prev, ...data }));
  }, []);

  const resetForm = useCallback(() => {
    setFormDataState(emptyForm);
    setError('');
  }, []);

  const initializeForm = useCallback((expense: Expense) => {
    setFormDataState({
      name: expense.name,
      description: expense.description,
      amount: expense.amount.toString(),
      date: new Date(expense.date).toISOString().split('T')[0],
      paymentMethod: expense.paymentMethod,
      receipt: expense.receipt || '',
      notes: expense.notes || '',
    });
    setError('');
  }, []);

  const handleSubmit = useCallback(
    async (onSubmit: (data: any) => Promise<boolean>) => {
      setError('');

      // Validate required fields
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

      setSubmitting(true);
      try {
        const payload = {
          name: formData.name.trim(),
          description: formData.description.trim(),
          amount: amountValue,
          date: formData.date,
          paymentMethod: formData.paymentMethod,
          receipt: formData.receipt?.trim() || undefined,
          notes: formData.notes?.trim() || undefined,
        };

        const success = await onSubmit(payload);
        if (!success) {
          setError('Failed to save expense');
        }
      } catch {
        setError('An error occurred while saving');
      } finally {
        setSubmitting(false);
      }
    },
    [formData]
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
