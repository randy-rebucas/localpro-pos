import { useCallback, useState } from 'react';

export interface JournalLine {
  id: string;
  accountId: string;
  debit: number | string;
  credit: number | string;
  description?: string | null;
  account?: { id: string; code: string; name: string; type: string };
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId?: string | null;
  entryDate: string;
  memo?: string | null;
  source: string;
  sourceId?: string | null;
  createdById?: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
  lines: JournalLine[];
  createdAt: string;
  updatedAt: string;
}

interface EntryFilters {
  startDate?: string;
  endDate?: string;
  source?: string;
  accountId?: string;
}

export interface ManualJournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export function useJournalEntries(tenant: string, filters: EntryFilters = {}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const params = new URLSearchParams({ tenant });
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.source) params.set('source', filters.source);
      if (filters.accountId) params.set('accountId', filters.accountId);

      const res = await globalThis.fetch(`/api/ledger/entries?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.success) {
        setEntries(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch journal entries';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch journal entries';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant, filters.startDate, filters.endDate, filters.source, filters.accountId]);

  const createManualEntry = useCallback(
    async (
      input: { entryDate?: string; memo?: string; branchId?: string; lines: ManualJournalLineInput[] },
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await globalThis.fetch(`/api/ledger/entries?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) {
          await fetchEntries();
          onSuccess?.();
        } else {
          onError?.(data.error || 'Failed to create journal entry');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to create journal entry');
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchEntries]
  );

  const deleteEntry = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await globalThis.fetch(`/api/ledger/entries/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) {
          await fetchEntries();
          onSuccess?.(data.message || 'Journal entry deleted successfully');
        } else {
          onError?.(data.error || 'Failed to delete journal entry');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to delete journal entry');
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchEntries]
  );

  return { entries, loading, error, fetchEntries, createManualEntry, deleteEntry };
}
