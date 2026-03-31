import { useState, useCallback } from 'react';

export interface AuditUser {
  _id: string;
  name: string;
}

export function useAuditUsers() {
  const [users, setUsers] = useState<AuditUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (onError?: (error: string) => void) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      setLoading(true);
      setError(null);

      const res = await globalThis.fetch('/api/users', {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch users`);
      }

      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        const errorMsg = data.error || 'Failed to fetch users';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch users. Please check your connection.';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  return {
    users,
    loading,
    error,
    fetch: fetchUsers,
  };
}
