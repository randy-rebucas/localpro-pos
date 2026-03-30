import { useState, useCallback } from 'react';

export interface ResetResults {
  [collection: string]: { deleted: number };
}

export function useResetCollections(tenant: string) {
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetResults, setResetResults] = useState<ResetResults | null>(null);

  const reset = useCallback(async (
    collections: string[],
    onSuccess?: (message: string, results: ResetResults) => void,
    onError?: (error: string) => void
  ) => {
    if (collections.length === 0) {
      const errorMsg = 'Please select at least one collection to reset.';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      setResetting(true);
      setError(null);
      setResetResults(null);

      const res = await globalThis.fetch(`/api/tenants/${tenant}/reset-collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ collections }),
      });

      const data = await res.json();
      if (data.success) {
        setResetResults(data.data.results);
        onSuccess?.(data.data.message, data.data.results);
        return true;
      } else {
        if (res.status === 401 || res.status === 403) {
          const errorMsg = 'Unauthorized. Only admins can reset collections.';
          setError(errorMsg);
          onError?.(errorMsg);
        } else {
          const errorMsg = data.error || 'Failed to reset collections';
          setError(errorMsg);
          onError?.(errorMsg);
        }
        return false;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset collections. Please check your connection.';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    } finally {
      clearTimeout(timeoutId);
      setResetting(false);
    }
  }, [tenant]);

  return {
    resetting,
    error,
    resetResults,
    reset,
  };
}
