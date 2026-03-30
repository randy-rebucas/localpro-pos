import { useState, useCallback } from 'react';

export interface RestoreResults {
  [collection: string]: { restored: number; cleared: number };
}

export function useRestoreCollections(tenant: string) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreResults, setRestoreResults] = useState<RestoreResults | null>(null);

  const restore = useCallback(async (
    file: File,
    clearExisting: boolean,
    onSuccess?: (message: string, results: RestoreResults) => void,
    onError?: (error: string) => void
  ) => {
    if (!file) {
      const errorMsg = 'Please select a backup file to restore.';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      setRestoring(true);
      setError(null);
      setRestoreResults(null);

      const fileContent = await file.text();
      let backupData;
      try {
        backupData = JSON.parse(fileContent);
      } catch (e) {
        const errorMsg = 'Invalid backup file format. Please select a valid JSON backup file.';
        setError(errorMsg);
        onError?.(errorMsg);
        return false;
      }

      if (!backupData.collections) {
        const errorMsg = 'Invalid backup file. Missing collections data.';
        setError(errorMsg);
        onError?.(errorMsg);
        return false;
      }

      const res = await globalThis.fetch(`/api/tenants/${tenant}/reset-collections`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ backupData, clearExisting }),
      });

      const data = await res.json();
      if (data.success) {
        setRestoreResults(data.data.results);
        onSuccess?.(data.data.message, data.data.results);
        return true;
      } else {
        if (res.status === 401 || res.status === 403) {
          const errorMsg = 'Unauthorized. Only admins can restore collections.';
          setError(errorMsg);
          onError?.(errorMsg);
        } else {
          const errorMsg = data.error || 'Failed to restore backup';
          setError(errorMsg);
          onError?.(errorMsg);
        }
        return false;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to restore backup. Please check your connection.';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    } finally {
      clearTimeout(timeoutId);
      setRestoring(false);
    }
  }, [tenant]);

  return {
    restoring,
    error,
    restoreResults,
    restore,
  };
}
