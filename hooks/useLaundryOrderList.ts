import { useCallback, useState } from 'react';

export interface LaundryOrderItem {
  id: string;
  laundryOrderId: string;
  productId?: string | null;
  name: string;
  tagNumber?: string | null;
  qrCode?: string | null;
  weightKg?: string | number | null;
  quantity: number;
  unitPrice: string | number;
  subtotal: string | number;
  condition?: string | null;
  notes?: string | null;
}

export interface LaundryOrder {
  id: string;
  tenantId: string;
  branchId?: string | null;
  transactionId?: string | null;
  customerId?: string | null;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  status:
    | 'booked'
    | 'picked_up'
    | 'received'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding'
    | 'ready'
    | 'out_for_delivery'
    | 'completed'
    | 'cancelled';
  pricingMethod: 'weight' | 'item';
  totalWeightKg?: string | number | null;
  totalAmount: string | number;
  notes?: string | null;
  items: LaundryOrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface LaundryOrderFilters {
  status: string;
  customerId: string;
}

export function useLaundryOrderList(tenant: string, filters: LaundryOrderFilters) {
  const [laundryOrders, setLaundryOrders] = useState<LaundryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLaundryOrders = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      let url = `/api/laundry-orders?tenant=${tenant}`;
      if (filters.status !== 'all') {
        url += `&status=${filters.status}`;
      }
      if (filters.customerId !== 'all') {
        url += `&customerId=${filters.customerId}`;
      }

      const res = await globalThis.fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setLaundryOrders(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch laundry orders';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch laundry orders';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.status, filters.customerId]);

  const updateLaundryOrder = useCallback(
    async (
      id: string,
      updates: Partial<Pick<LaundryOrder, 'status' | 'notes' | 'totalWeightKg'>>,
      onSuccess?: (message: string) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/laundry-orders/${id}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchLaundryOrders();
          onSuccess?.(data.message || 'Laundry order updated successfully');
        } else {
          const errorMsg = data.error || 'Failed to update laundry order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update laundry order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchLaundryOrders]
  );

  const cancelLaundryOrder = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/laundry-orders/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchLaundryOrders();
          onSuccess?.(data.message || 'Laundry order cancelled successfully');
        } else {
          const errorMsg = data.error || 'Failed to cancel laundry order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to cancel laundry order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchLaundryOrders]
  );

  return { laundryOrders, loading, error, fetchLaundryOrders, updateLaundryOrder, cancelLaundryOrder };
}
