import { useCallback, useState } from 'react';
import type { ITenantSettings } from '@/types/tenant';

export function useBusinessHoursSettings(tenantId: string) {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await globalThis.fetch(`/api/tenants/${tenantId}/settings`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setSettings(data.data || null);
      } else {
        const errorMsg = data.error || 'Failed to fetch settings';
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch settings';
      setError(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenantId]);

  const updateSettings = useCallback(
    async (updates: Partial<ITenantSettings>, onSuccess?: () => void, onError?: (error: string) => void) => {
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await globalThis.fetch(`/api/tenants/${tenantId}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          setSettings((prev) => (prev ? { ...prev, ...updates } : null));
          onSuccess?.();
        } else {
          const errorMsg = data.error || 'Failed to update settings';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update settings';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
      }
    },
    [tenantId]
  );

  return { settings, loading, error, fetchSettings, updateSettings };
}
