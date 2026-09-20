import { useCallback, useState } from 'react';

export interface WorkOrderTimeEntry {
  id: string;
  tenantId: string;
  workOrderId: string;
  userId: string;
  user?: { id: string; name: string; email: string } | null;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useWorkOrderTimeEntries(tenant: string, workOrderId: string) {
  const [timeEntries, setTimeEntries] = useState<WorkOrderTimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTimeEntries = useCallback(async (onError?: (error: string) => void) => {
    if (!workOrderId) return;
    setLoading(true);
    try {
      const res = await globalThis.fetch(`/api/work-orders/${workOrderId}/time-entries?tenant=${tenant}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setTimeEntries(data.data || []);
      } else {
        onError?.(data.error || 'Failed to fetch time entries');
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to fetch time entries');
    } finally {
      setLoading(false);
    }
  }, [tenant, workOrderId]);

  const startTimeEntry = useCallback(
    async (onSuccess?: () => void, onError?: (error: string) => void) => {
      try {
        const res = await globalThis.fetch(`/api/work-orders/${workOrderId}/time-entries?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.success) {
          await fetchTimeEntries();
          onSuccess?.();
        } else {
          onError?.(data.error || 'Failed to start time entry');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to start time entry');
      }
    },
    [tenant, workOrderId, fetchTimeEntries]
  );

  const stopTimeEntry = useCallback(
    async (entryId: string, onSuccess?: () => void, onError?: (error: string) => void) => {
      try {
        const res = await globalThis.fetch(`/api/work-orders/${workOrderId}/time-entries/${entryId}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ stop: true }),
        });
        const data = await res.json();
        if (data.success) {
          await fetchTimeEntries();
          onSuccess?.();
        } else {
          onError?.(data.error || 'Failed to stop time entry');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to stop time entry');
      }
    },
    [tenant, workOrderId, fetchTimeEntries]
  );

  return { timeEntries, loading, fetchTimeEntries, startTimeEntry, stopTimeEntry };
}
