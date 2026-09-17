import { useCallback, useState } from 'react';
import type { CashDrawerSession } from '@/types/cash-drawer';
export type { CashDrawerSession };

export function useCashDrawerSessions() {
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSessions = useCallback(
    async (statusFilter?: string, onError?: (error: string) => void, page = 1, limit = 10) => {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (statusFilter) {
          params.set('status', statusFilter);
        }

        const res = await globalThis.fetch(`/api/cash-drawer/sessions?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setSessions(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
        } else {
          const errorMsg = data.error || 'Failed to fetch cash drawer sessions';
          setError(errorMsg);
          onError?.(errorMsg);
          setSessions([]);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch cash drawer sessions';
        setError(errorMsg);
        onError?.(errorMsg);
        setSessions([]);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    },
    []
  );

  return { sessions, loading, error, totalPages, fetchSessions };
}
