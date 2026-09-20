import { useCallback, useState } from 'react';

export interface InvoiceItem {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  price: string | number;
  subtotal: string | number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  transactionId?: string | null;
  customerId?: string | null;
  snapshotName?: string | null;
  snapshotEmail?: string | null;
  snapshotPhone?: string | null;
  subtotal: string | number;
  discountAmount?: string | number | null;
  taxAmount: string | number;
  total: string | number;
  dueDate: string;
  paymentTerms?: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  paidAt?: string | null;
  paidAmount?: string | number | null;
  notes?: string | null;
  items: InvoiceItem[];
  transaction?: { receiptNumber: string; total: string | number } | null;
  customer?: { firstName: string; lastName: string; email?: string | null; phone?: string | null } | null;
  createdAt: string;
}

export interface InvoiceFilters {
  status: string;
  customerId: string;
  overdue: boolean;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function useInvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const fetchInvoices = useCallback(async (filters: InvoiceFilters, page = 1, onError?: (error: string) => void) => {
    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      if (filters.customerId) params.append('customerId', filters.customerId);
      if (filters.overdue) params.append('overdue', 'true');
      params.append('page', String(page));
      params.append('limit', '50');

      const res = await globalThis.fetch(`/api/invoices?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setInvoices(data.data || []);
        setPagination(data.pagination || null);
      } else {
        onError?.(data.error || 'Failed to fetch invoices');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        onError?.(err.message || 'Failed to fetch invoices');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const updateInvoiceStatus = useCallback(
    async (
      id: string,
      updates: { status?: string; notes?: string; paidAmount?: number },
      onSuccess?: (invoice: Invoice) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/invoices/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error || 'Failed to update invoice');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to update invoice');
      } finally {
        clearTimeout(timeout);
      }
    },
    []
  );

  return { invoices, loading, pagination, fetchInvoices, updateInvoiceStatus };
}
