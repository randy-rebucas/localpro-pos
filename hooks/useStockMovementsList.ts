import { useCallback, useRef, useState } from 'react';

export interface StockMovement {
  _id: string;
  productId: string | { _id: string; name: string; sku?: string };
  branchId?: string | { _id: string; name: string };
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
  type: 'sale' | 'purchase' | 'adjustment' | 'return' | 'damage' | 'transfer';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  transactionId?: string | { receiptNumber?: string };
  userId?: string | { name: string; email: string };
  notes?: string;
  createdAt: string;
}

export interface StockMovementsFilters {
  type: string;
  productId: string;
}

export const useStockMovementsList = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<StockMovementsFilters>({
    type: '',
    productId: '',
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMovements = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      let url = `/api/stock-movements?page=${page}&limit=50`;
      if (filters.type) url += `&type=${filters.type}`;
      if (filters.productId) url += `&productId=${filters.productId}`;

      const res = await fetch(url, { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setMovements(data.data);
        setTotalPages(data.pagination?.pages || 1);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch stock movements' });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessage({ type: 'error', text: 'Failed to fetch stock movements' });
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [page, filters]);

  const updateFilters = useCallback((newFilters: Partial<StockMovementsFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page on filter change
  }, []);

  const updatePage = useCallback((newPage: number) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  }, [totalPages]);

  const updateMessage = useCallback((msg: { type: 'success' | 'error'; text: string } | null) => {
    setMessage(msg);
  }, []);

  return {
    movements,
    loading,
    page,
    totalPages,
    filters,
    message,
    fetchMovements,
    updateFilters,
    updatePage,
    updateMessage,
  };
};
