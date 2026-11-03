import { useCallback, useState } from 'react';
import type { ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

export function useBusinessHoursSettings(tenantId: string) {
  // Read from TenantSettingsContext (already loaded by the layout) instead of a
  // separate GET; saves still PUT and then merge into the shared context.
  const { settings, ensureSettings, applySettings } = useTenantSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await ensureSettings();
    if (result.error) setError(result.error);
    setLoading(false);
  }, [ensureSettings]);

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
          applySettings({ ...updates, ...(data.data || {}) });
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
    [tenantId, applySettings]
  );

  return { settings: loading ? null : settings, loading, error, fetchSettings, updateSettings };
}
