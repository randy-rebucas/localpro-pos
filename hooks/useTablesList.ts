import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';

export interface Table {
  _id: string;
  name: string;
  capacity?: number;
  status: 'open' | 'occupied' | 'check-requested';
  isActive: boolean;
}

export function useTablesList() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTables = useCallback(
    async (tenant: string, showInactive: boolean, onError?: (error: string) => void) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        const res = await fetch(
          `/api/tables?isActive=${showInactive ? 'all' : 'true'}`,
          { credentials: 'include', signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const data = await res.json();
        if (data.success) {
          setTables(data.data || []);
        } else {
          const error = data.error || 'Failed to load tables';
          if (onError) onError(error);
          toast.error(error);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const error = 'Error loading tables';
        if (onError) onError(error);
        toast.error(error);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteTable = useCallback(
    async (id: string, onSuccess?: () => void, onError?: (error: string) => void) => {
      try {
        const res = await fetch(`/api/tables/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        const data = await res.json();
        if (data.success) {
          setTables((prev) => prev.filter((t) => t._id !== id));
          if (onSuccess) onSuccess();
          toast.success('Table deleted');
        } else {
          const error = data.error || 'Failed to delete table';
          if (onError) onError(error);
          toast.error(error);
        }
      } catch (err: unknown) {
        const error = 'Error deleting table';
        if (onError) onError(error);
        toast.error(error);
      }
    },
    []
  );

  const toggleTableStatus = useCallback(
    async (id: string, newStatus: boolean, onSuccess?: () => void, onError?: (error: string) => void) => {
      try {
        const res = await fetch(`/api/tables/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: newStatus }),
        });

        const data = await res.json();
        if (data.success) {
          setTables((prev) => prev.map((t) => (t._id === id ? { ...t, isActive: newStatus } : t)));
          if (onSuccess) onSuccess();
          toast.success(newStatus ? 'Table activated' : 'Table deactivated');
        } else {
          const error = data.error || 'Failed to update table';
          if (onError) onError(error);
          toast.error(error);
        }
      } catch (err: unknown) {
        const error = 'Error updating table';
        if (onError) onError(error);
        toast.error(error);
      }
    },
    []
  );

  return { tables, loading, fetchTables, deleteTable, toggleTableStatus };
}
