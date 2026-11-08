import { useState, useCallback, useRef } from 'react';

/** Wording the page passes in so errors read in the tenant's language; English otherwise. */
export type BackupMessages = Partial<Record<'selectFirst' | 'unauthorized' | 'failed' | 'invalidFormat' | 'invalidFile', string>>;

export function useBackupCollections(tenant: string, messages?: BackupMessages) {
  const msgs = useRef(messages);
  msgs.current = messages;
  const [backing, setBacking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createBackup = useCallback(async (collections: string[], onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
    if (collections.length === 0) {
      const errorMsg = msgs.current?.selectFirst || 'Please select at least one collection to backup.';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      setBacking(true);
      setError(null);

      const collectionsParam = collections.join(',');
      const url = `/api/tenants/${tenant}/reset-collections?collections=${collectionsParam}`;

      const res = await globalThis.fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          const errorMsg = msgs.current?.unauthorized || 'Unauthorized. Only admins can backup collections.';
          setError(errorMsg);
          onError?.(errorMsg);
        } else {
          const errorMsg = data.error || msgs.current?.failed || 'Failed to create backup';
          setError(errorMsg);
          onError?.(errorMsg);
        }
        return false;
      }

      // Download the file
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `backup-${tenant}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      const successMsg = `Backup created successfully for ${collections.length} collection(s)`;
      onSuccess?.(successMsg);
      return true;
    } catch (err) {
      const errorMsg = msgs.current?.failed || (err instanceof Error ? err.message : 'Failed to create backup. Please check your connection.');
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    } finally {
      clearTimeout(timeoutId);
      setBacking(false);
    }
  }, [tenant]);

  return {
    backing,
    error,
    createBackup,
  };
}
