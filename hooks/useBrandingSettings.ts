import { useState, useCallback } from 'react';
import { ITenantSettings } from '@/types/tenant';

export function useBrandingSettings(tenant: string) {
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (onError?: (error: string) => void) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        signal: controller.signal,
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch settings`);
      }

      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      } else {
        const errorMsg = data.error || 'Failed to load settings';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load settings. Please check your connection.';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [tenant]);

  const updateSetting = useCallback((path: string, value: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!settings) return;

    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings));
    let current: any = newSettings; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  }, [settings]);

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSetting,
  };
}
