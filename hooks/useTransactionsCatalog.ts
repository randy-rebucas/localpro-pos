'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
  discountCategory?: 'general' | 'senior' | 'pwd' | 'employee' | 'promo';
  discountAmount?: number;
  vatRemovedAmount?: number;
  taxAmount?: number;
  scPwdName?: string;
  scPwdId?: string;
  zeroRatedAmount?: number;
  terminalId?: string;
  deviceSerialNumber?: string;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  refundCount?: number;
  salesChannel?: string;
  voidReason?: string;
  customerId?: string | { firstName?: string; lastName?: string } | null;
  userId?: string | { name: string; email: string };
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

export type CatalogView = 'all' | 'transactions' | 'expenses';

export interface TransactionFilterValues {
  search: string;
  startDate: string;
  endDate: string;
  status: string;
  paymentMethod: string;
  userId: string;
  branchId: string;
}

export const EMPTY_TRANSACTION_FILTERS: TransactionFilterValues = {
  search: '',
  startDate: '',
  endDate: '',
  status: '',
  paymentMethod: '',
  userId: '',
  branchId: '',
};

/** The view and filters as a query string, shared with the export. */
export function transactionFilterQuery(view: CatalogView, filters: TransactionFilterValues): string {
  const params = new URLSearchParams({ type: view });
  // Expenses have no status or branch, so those only apply where sales are shown
  const salesOnly = view === 'expenses' ? ['status', 'branchId'] : [];
  for (const [key, value] of Object.entries(filters)) {
    if (value && !salesOnly.includes(key)) params.set(key, value);
  }
  return params.toString();
}

export type CatalogEntry =
  | { type: 'transaction'; data: CatalogTransaction; date: string }
  | { type: 'expense'; data: CatalogExpense; date: string };

export function useTransactionsCatalog(tenant: string, page: number, view: CatalogView, filters: TransactionFilterValues) {
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const query = transactionFilterQuery(view, filters);

  const refetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/transactions/feed?page=${page}&limit=10&${query}&tenant=${tenant}`, { credentials: 'include' });
      const data = await res.json();
      // Ignore responses superseded by a newer page or tab
      if (requestId !== requestIdRef.current) return;

      if (data.success) {
        setItems(data.data);
        setTotalPages(Math.max(1, data.pagination?.pages ?? 1));
        setStatus('ready');
      } else {
        setItems([]);
        setTotalPages(1);
        setError(data.error || 'Failed to load transactions');
        setStatus('error');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching transactions catalog:', err);
      setError('Failed to load transactions');
      setItems([]);
      setTotalPages(1);
      setStatus('error');
    }
  }, [tenant, page, query]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateTransactionStatus = useCallback((id: string, newStatus: CatalogTransaction['status']) => {
    setItems((prev) => prev.map((item) => (
      item.type === 'transaction' && item.data._id === id
        ? { ...item, data: { ...item.data, status: newStatus } }
        : item
    )));
  }, []);

  return {
    items,
    totalPages,
    status,
    error,
    refetch,
    updateTransactionStatus,
  };
}
