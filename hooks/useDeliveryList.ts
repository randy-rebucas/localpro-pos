import { useCallback, useState } from 'react';

export interface DeliveryOrder {
  id: string;
  tenantId: string;
  branchId?: string | null;
  transactionId?: string | null;
  customerId?: string | null;
  addressStreet: string;
  addressCity: string;
  addressState?: string | null;
  addressZipCode?: string | null;
  addressCountry: string;
  addressLatitude?: string | number | null;
  addressLongitude?: string | number | null;
  riderId?: string | null;
  rider?: { id: string; name: string; email: string } | null;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
  type: 'pickup' | 'delivery';
  scheduledAt?: string | null;
  assignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryFilters {
  status: string;
  riderId: string;
}

export function useDeliveryList(tenant: string, filters: DeliveryFilters) {
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeliveryOrders = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      let url = `/api/delivery?tenant=${tenant}`;
      if (filters.status !== 'all') {
        url += `&status=${filters.status}`;
      }
      if (filters.riderId !== 'all') {
        url += `&riderId=${filters.riderId}`;
      }

      const res = await globalThis.fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setDeliveryOrders(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch delivery orders';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch delivery orders';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.status, filters.riderId]);

  const updateDeliveryOrder = useCallback(
    async (
      id: string,
      updates: Partial<Pick<DeliveryOrder, 'status' | 'riderId' | 'notes' | 'failureReason'>>,
      onSuccess?: (message: string) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/delivery/${id}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchDeliveryOrders();
          onSuccess?.(data.message || 'Delivery order updated successfully');
        } else {
          const errorMsg = data.error || 'Failed to update delivery order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update delivery order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchDeliveryOrders]
  );

  const cancelDeliveryOrder = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/delivery/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchDeliveryOrders();
          onSuccess?.(data.message || 'Delivery order cancelled successfully');
        } else {
          const errorMsg = data.error || 'Failed to cancel delivery order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to cancel delivery order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchDeliveryOrders]
  );

  return { deliveryOrders, loading, error, fetchDeliveryOrders, updateDeliveryOrder, cancelDeliveryOrder };
}
