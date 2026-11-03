import { useState, useCallback } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useBrandingSettings(tenant: string) {
  // Seeded from TenantSettingsContext (already loaded for the layout) instead of
  // a separate GET /api/tenants/[slug]/settings.
  const { ensureSettings } = useTenantSettings();
  const [settings, setSettings] = useState<ITenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);
    const result = await ensureSettings();
    if (result.error) {
      setSettings(null);
      setError(result.error);
      onError?.(result.error);
    } else {
      setSettings(result.settings);
    }
    setLoading(false);
  }, [ensureSettings]);

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
