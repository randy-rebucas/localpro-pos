import { useCallback, useState } from 'react';

export interface Branch {
  _id: string;
  name: string;
  code?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  managerId?: {
    _id: string;
    name: string;
    email: string;
  } | string;
  isActive: boolean;
  createdAt: string;
}

export function useBranchesList() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await globalThis.fetch('/api/branches', {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setBranches(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch branches';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch branches';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  const deleteBranch = useCallback(
    async (branchId: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/branches/${branchId}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchBranches();
          onSuccess?.(data.message || 'Branch deleted successfully');
        } else {
          const errorMsg = data.error || 'Failed to delete branch';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete branch';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [fetchBranches]
  );

  const toggleBranchStatus = useCallback(
    async (branchId: string, isActive: boolean, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/branches/${branchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ isActive: !isActive }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          await fetchBranches();
          onSuccess?.(data.message || `Branch ${!isActive ? 'activated' : 'deactivated'} successfully`);
        } else {
          const errorMsg = data.error || 'Failed to update branch';
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update branch';
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [fetchBranches]
  );

  return { branches, loading, error, fetchBranches, deleteBranch, toggleBranchStatus };
}
