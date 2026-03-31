import { useCallback, useState } from 'react';

export interface CashDrawerSession {
  _id: string;
  userId: string | { _id: string; name: string; email: string };
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  shortage?: number;
  overage?: number;
  openingTime: string;
  closingTime?: string;
  status: 'open' | 'closed';
  notes?: string;
  totalVAT?: number;
  totalDiscounts?: number;
  createdAt: string;
}

export function useCashDrawerSessions() {
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(
    async (statusFilter?: string, onError?: (error: string) => void) => {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        let url = '/api/cash-drawer/sessions';
        if (statusFilter) {
          url += `?status=${statusFilter}`;
        }

        const res = await globalThis.fetch(url, {
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setSessions(data.data || []);
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

  return { sessions, loading, error, fetchSessions };
}
