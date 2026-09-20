import { useCallback, useState } from 'react';

export interface LedgerAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId?: string | null;
  isSystemAccount: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useLedgerAccounts(tenant: string) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await globalThis.fetch(`/api/ledger/accounts?tenant=${tenant}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json();

      if (data.success) {
        setAccounts(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch ledger accounts';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch ledger accounts';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant]);

  const createAccount = useCallback(
    async (
      input: { code: string; name: string; type: LedgerAccount['type']; parentId?: string },
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await globalThis.fetch(`/api/ledger/accounts?tenant=${tenant}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) {
          await fetchAccounts();
          onSuccess?.();
        } else {
          onError?.(data.error || 'Failed to create ledger account');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to create ledger account');
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchAccounts]
  );

  const updateAccount = useCallback(
    async (
      id: string,
      updates: Partial<Pick<LedgerAccount, 'name' | 'type' | 'code' | 'isActive'>>,
      onSuccess?: () => void,
      onError?: (error: string) => void
    ) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await globalThis.fetch(`/api/ledger/accounts/${id}?tenant=${tenant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) {
          await fetchAccounts();
          onSuccess?.();
        } else {
          onError?.(data.error || 'Failed to update ledger account');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to update ledger account');
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchAccounts]
  );

  const deleteAccount = useCallback(
    async (id: string, onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await globalThis.fetch(`/api/ledger/accounts/${id}?tenant=${tenant}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        });
        const data = await res.json();
        if (data.success) {
          await fetchAccounts();
          onSuccess?.(data.message || 'Ledger account deactivated successfully');
        } else {
          onError?.(data.error || 'Failed to delete ledger account');
        }
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to delete ledger account');
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenant, fetchAccounts]
  );

  return { accounts, loading, error, fetchAccounts, createAccount, updateAccount, deleteAccount };
}
