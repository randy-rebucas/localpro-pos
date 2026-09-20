import { useCallback, useState } from 'react';

export interface Deposit {
  id: string;
  tenantId: string;
  bookingId?: string | null;
  workOrderId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  amount: string | number;
  method: 'cash' | 'card' | 'digital' | 'check' | 'other' | 'on_account';
  status: 'pending' | 'paid' | 'applied' | 'refunded' | 'forfeited' | 'cancelled';
  refundedAmount?: string | number | null;
  notes?: string | null;
  booking?: { id: string; serviceName: string; customerName: string; startTime: string } | null;
  workOrder?: { id: string; title: string } | null;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  invoice?: { id: string; invoiceNumber: string; total: string | number } | null;
  recordedBy?: { id: string; name: string } | null;
  paidAt?: string | null;
  appliedAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DepositFilters {
  status: string;
}

export function useDepositList(tenant: string, filters: DepositFilters) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeposits = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      let url = `/api/deposits?tenant=${tenant}`;
      if (filters.status !== 'all') {
        url += `&status=${filters.status}`;
      }

      const res = await globalThis.fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setDeposits(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch deposits';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch deposits';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.status]);

  const updateDeposit = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Deposit, 'status' | 'invoiceId' | 'notes' | 'refundedAmount'>>,
      onSuccess?: (message: string) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/deposits/${id}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchDeposits();
          onSuccess?.(data.message || 'Deposit updated successfully');
        } else {
          const errorMsg = data.error || 'Failed to update deposit';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update deposit';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchDeposits]
  );

  const cancelDeposit = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/deposits/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchDeposits();
          onSuccess?.(data.message || 'Deposit cancelled successfully');
        } else {
          const errorMsg = data.error || 'Failed to cancel deposit';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to cancel deposit';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchDeposits]
  );

  return { deposits, loading, error, fetchDeposits, updateDeposit, cancelDeposit };
}
