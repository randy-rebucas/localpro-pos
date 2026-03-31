'use client';

import { useCallback, useState } from 'react';

export interface Expense {
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

export interface ExpenseFilters {
  startDate: string;
  endDate: string;
  name: string;
}

interface UseExpensesListReturn {
  expenses: Expense[];
  loading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  filters: ExpenseFilters;
  expenseNames: string[];
  deletingId: string | null;
  totalAmount: number;
  setFilters: (filters: ExpenseFilters) => void;
  setMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
  fetchExpenses: () => Promise<void>;
  createExpense: (form: any) => Promise<boolean>;
  updateExpense: (id: string, form: any) => Promise<boolean>;
  deleteExpense: (id: string) => Promise<boolean>;
  setDeletingId: (id: string | null) => void;
}

export function useExpensesList(): UseExpensesListReturn {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filters, setFilters] = useState<ExpenseFilters>({ startDate: '', endDate: '', name: '' });
  const [expenseNames, setExpenseNames] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Calculate total amount
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.name) params.append('name', filters.name);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`/api/expenses?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setExpenses(data.data || []);
        // Extract unique expense names
        const uniqueNames = Array.from(new Set((data.data || []).map((e: Expense) => e.name))).sort() as string[];
        setExpenseNames(uniqueNames);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch expenses' });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to fetch expenses:', error);
        setMessage({ type: 'error', text: 'Failed to fetch expenses' });
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const createExpense = useCallback(async (form: any) => {
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to save expense' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to save expense' });
      return false;
    }
  }, []);

  const updateExpense = useCallback(async (id: string, form: any) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (data.success) {
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to update expense' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to update expense' });
      return false;
    }
  }, []);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        return true;
      }
      setMessage({ type: 'error', text: data.error || 'Failed to delete expense' });
      return false;
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete expense' });
      return false;
    }
  }, []);

  return {
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
    createExpense,
    updateExpense,
    deleteExpense,
    setDeletingId,
  };
}
