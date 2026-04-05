import { useCallback } from 'react';
import { useInfiniteScroll } from './useInfiniteScroll';

export interface Receivable {
  _id: string;
  customerId: {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
  };
  transactionId: {
    _id: string;
    receiptNumber: string;
  };
  originalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate: string;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  createdAt: string;
}

interface Summary {
  totalOutstanding: number;
  totalPaid: number;
  totalInvoiced: number;
}

export function useReceivablesList(tenant: string, statusFilter: string) {
  // Build API URL with filters
  const apiUrl = `/api/receivables?${
    statusFilter ? `status=${statusFilter}&` : ''
  }limit=50&tenant=${tenant}`;

  const { items, loading, error, hasMore, endRef, retry, reset } = useInfiniteScroll<Receivable>({
    apiUrl,
    pageSize: 50,
    threshold: 0.3,
  });

  // Fetch summary
  const fetchSummary = useCallback(
    async (onSuccess: (summary: Summary) => void) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await fetch(`/api/receivables?limit=1&tenant=${tenant}`, {
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();
        if (data.success && data.summary) {
          onSuccess(data.summary);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Failed to fetch summary:', err);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    },
    [tenant]
  );

  return {
    items,
    loading,
    error,
    hasMore,
    endRef,
    retry,
    reset,
    fetchSummary,
  };
}
