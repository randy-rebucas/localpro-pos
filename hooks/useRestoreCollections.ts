import { useState, useCallback, useRef } from 'react';
import { MAX_RESTORE_BYTES } from '@/lib/restore-references';

/** Wording the page passes in so errors read in the tenant's language; English otherwise. */
export type RestoreMessages = Partial<Record<'selectFirst' | 'unauthorized' | 'failed' | 'invalidFormat' | 'invalidFile' | 'tooLarge' | 'tooManyRecords', string>>;

export interface RestoreResults {
  [collection: string]: { restored: number; cleared: number; skipped?: number; badReference?: number };
}

export function useRestoreCollections(tenant: string, messages?: RestoreMessages) {
  const msgs = useRef(messages);
  msgs.current = messages;
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreResults, setRestoreResults] = useState<RestoreResults | null>(null);
  /** Collections in the file that were not restored (audit logs, unknown names). */
  const [ignored, setIgnored] = useState<string[]>([]);

  const restore = useCallback(async (
    file: File,
    clearExisting: boolean,
    onSuccess?: (message: string, results: RestoreResults, ignored: string[]) => void,
    onError?: (error: string) => void
  ) => {
    if (!file) {
      const errorMsg = msgs.current?.selectFirst || 'Please select a backup file to restore.';
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
      setIgnored([]);

      if (file.size > MAX_RESTORE_BYTES) {
        const errorMsg = msgs.current?.tooLarge || 'The backup file is too large to restore (25 MB at most).';
        setError(errorMsg);
        onError?.(errorMsg);
        return false;
      }

      const fileContent = await file.text();
      let backupData;
      try {
        backupData = JSON.parse(fileContent);
      } catch (e) {
        const errorMsg = msgs.current?.invalidFormat || 'Invalid backup file format. Please select a valid JSON backup file.';
        setError(errorMsg);
        onError?.(errorMsg);
        return false;
      }

      if (!backupData.collections) {
        const errorMsg = msgs.current?.invalidFile || 'Invalid backup file. Missing collections data.';
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
        const skippedCollections: string[] = Array.isArray(data.data.ignored) ? data.data.ignored : [];
        setRestoreResults(data.data.results);
        setIgnored(skippedCollections);
        onSuccess?.(data.data.message, data.data.results, skippedCollections);
        return true;
      } else {
        if (res.status === 401 || res.status === 403) {
          const errorMsg = msgs.current?.unauthorized || 'Unauthorized. Only admins can restore collections.';
          setError(errorMsg);
          onError?.(errorMsg);
        } else if (res.status === 413) {
          const errorMsg = (data.code === 'too_many_records' ? msgs.current?.tooManyRecords : msgs.current?.tooLarge) || data.error || 'The backup file is too large to restore.';
          setError(errorMsg);
          onError?.(errorMsg);
        } else {
          const errorMsg = data.error || msgs.current?.failed || 'Failed to restore backup';
          setError(errorMsg);
          onError?.(errorMsg);
        }
        return false;
      }
    } catch (err) {
      const errorMsg = msgs.current?.failed || (err instanceof Error ? err.message : 'Failed to restore backup. Please check your connection.');
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
    ignored,
    restore,
  };
}
