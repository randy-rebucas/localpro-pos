import { useCallback, useState } from 'react';

export interface Transaction {
  _id: string;
  receiptNumber?: string;
  items: Array<{
    product: string | { name: string };
    name: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'digital';
  cashReceived?: number;
  change?: number;
  status: 'completed' | 'cancelled' | 'refunded';
  userId?: string | { name: string; email: string };
  notes?: string;
  createdAt: string;
}

export function useTransactionsList() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTransactions = useCallback(async (pageNum: number, dict?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?page=${pageNum}&limit=50`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data || []);
        setTotalPages(data.pagination?.pages || 1);
        setMessage(null);
      } else {
        const errorMsg =
          data.error ||
          (dict && typeof dict.common === 'object' && dict.common && 'failedToFetchTransactions' in dict.common
            ? String(dict.common.failedToFetchTransactions)
            : 'Failed to fetch transactions');
        setMessage({ type: 'error', text: errorMsg });
        setTransactions([]);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const errorMsg =
        dict && typeof dict.common === 'object' && dict.common && 'failedToFetchTransactions' in dict.common
          ? String(dict.common.failedToFetchTransactions)
          : 'Failed to fetch transactions';
      setMessage({ type: 'error', text: errorMsg });
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const goToPage = useCallback(
    (newPage: number, dict?: Record<string, unknown>) => {
      const clampedPage = Math.max(1, Math.min(newPage, totalPages));
      setPage(clampedPage);
      fetchTransactions(clampedPage, dict);
    },
    [totalPages, fetchTransactions]
  );

  return {
    transactions,
    loading,
    page,
    totalPages,
    message,
    fetchTransactions,
    goToPage,
  };
}
