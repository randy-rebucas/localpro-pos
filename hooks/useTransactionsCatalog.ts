'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CatalogTransactionItem {
  product: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CatalogTransaction {
  _id: string;
  receiptNumber?: string;
  items: CatalogTransactionItem[];
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

export interface CatalogExpense {
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

export type CatalogStatus = 'loading' | 'ready' | 'error';

export function useTransactionsCatalog(tenant: string, page: number) {
  const [transactions, setTransactions] = useState<CatalogTransaction[]>([]);
  const [expenses, setExpenses] = useState<CatalogExpense[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [txRes, expRes] = await Promise.all([
        fetch(`/api/transactions?page=${page}&limit=20&tenant=${tenant}`, { credentials: 'include' }),
        fetch(`/api/expenses?tenant=${tenant}`, { credentials: 'include' }),
      ]);
      const [txData, expData] = await Promise.all([txRes.json(), expRes.json()]);

      let txOk = false;
      let expOk = false;

      if (txData.success) {
        setTransactions(txData.data);
        setTotalPages(txData.pagination?.pages ?? 1);
        txOk = true;
      } else {
        setTransactions([]);
        setTotalPages(1);
      }

      if (expData.success) {
        setExpenses(expData.data);
        expOk = true;
      } else {
        setExpenses([]);
      }

      if (!txOk && !expOk) {
        setError(txData.error || expData.error || 'Failed to load transactions');
        setStatus('error');
      } else if (!txOk) {
        setError(txData.error || 'Failed to load transactions');
        setStatus('error');
      } else if (!expOk) {
        setError(expData.error || 'Failed to load expenses');
        setStatus('error');
      } else {
        setStatus('ready');
      }
    } catch (err) {
      console.error('Error fetching transactions catalog:', err);
      setError('Failed to load transactions');
      setTransactions([]);
      setExpenses([]);
      setTotalPages(1);
      setStatus('error');
    }
  }, [tenant, page]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateTransactionStatus = useCallback((id: string, newStatus: CatalogTransaction['status']) => {
    setTransactions((prev) => prev.map((t) => (t._id === id ? { ...t, status: newStatus } : t)));
  }, []);

  return {
    transactions,
    expenses,
    totalPages,
    status,
    error,
    refetch,
    updateTransactionStatus,
  };
}
