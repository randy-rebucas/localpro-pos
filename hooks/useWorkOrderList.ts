import { useCallback, useState } from 'react';

export interface WorkOrderItem {
  id: string;
  workOrderId: string;
  productId?: string | null;
  name: string;
  itemType: string;
  price: string | number;
  quantity: number;
  subtotal: string | number;
}

export interface WorkOrder {
  id: string;
  tenantId: string;
  branchId?: string | null;
  transactionId?: string | null;
  customerId?: string | null;
  title: string;
  description?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string; email: string } | null;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  status: 'pending' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  scheduledAt?: string | null;
  assignedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  cancellationReason?: string | null;
  items?: WorkOrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface WorkOrderFilters {
  status: string;
  assignedToId: string;
}

export function useWorkOrderList(tenant: string, filters: WorkOrderFilters) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkOrders = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      let url = `/api/work-orders?tenant=${tenant}`;
      if (filters.status !== 'all') {
        url += `&status=${filters.status}`;
      }
      if (filters.assignedToId !== 'all') {
        url += `&assignedToId=${filters.assignedToId}`;
      }

      const res = await globalThis.fetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setWorkOrders(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch work orders';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch work orders';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.status, filters.assignedToId]);

  const updateWorkOrder = useCallback(
    async (
      id: string,
      updates: Partial<Pick<WorkOrder, 'status' | 'assignedToId' | 'notes' | 'cancellationReason'>>,
      onSuccess?: (message: string) => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/work-orders/${id}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchWorkOrders();
          onSuccess?.(data.message || 'Work order updated successfully');
        } else {
          const errorMsg = data.error || 'Failed to update work order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update work order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchWorkOrders]
  );

  const cancelWorkOrder = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/work-orders/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchWorkOrders();
          onSuccess?.(data.message || 'Work order cancelled successfully');
        } else {
          const errorMsg = data.error || 'Failed to cancel work order';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to cancel work order';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchWorkOrders]
  );

  return { workOrders, loading, error, fetchWorkOrders, updateWorkOrder, cancelWorkOrder };
}
