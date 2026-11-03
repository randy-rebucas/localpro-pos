import { useState, useCallback } from 'react';
import { ITenantSettings } from '@/types/tenant';
import { pickChangedSettings, useTenantSettings } from '@/contexts/TenantSettingsContext';

export function useBrandingSave(tenant: string) {
  const { settings: contextSettings, applySettings } = useTenantSettings();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const save = useCallback(async (settings: ITenantSettings, onSuccess?: () => void, onError?: (error: string) => void) => {
    if (!settings) {
      onError?.('No settings to save');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      setSaving(true);
      setMessage(null);

      const res = await fetch(`/api/tenants/${tenant}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: controller.signal,
        // Only the keys this page changed (the route merges server-side)
        body: JSON.stringify({ settings: pickChangedSettings(settings, contextSettings) }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          const errorMsg = 'Unauthorized. Please login with admin account.';
          setMessage({ type: 'error', text: errorMsg });
          onError?.(errorMsg);
          return false;
        }
        throw new Error(`HTTP ${res.status}: Failed to save settings`);
      }

      const data = await res.json();
      if (data.success) {
        // Keep the shared context (and the branding it applies) in sync
        applySettings(data.data);
        const successMsg = 'Advanced branding settings saved successfully!';
        setMessage({ type: 'success', text: successMsg });
        onSuccess?.();
        setTimeout(() => setMessage(null), 3000);
        return true;
      } else {
        const errorMsg = data.error || 'Failed to save settings';
        setMessage({ type: 'error', text: errorMsg });
        onError?.(errorMsg);
        return false;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save settings. Please check your connection.';
      setMessage({ type: 'error', text: errorMsg });
      onError?.(errorMsg);
      return false;
    } finally {
      clearTimeout(timeoutId);
      setSaving(false);
    }
  }, [tenant, contextSettings, applySettings]);

  return {
    saving,
    message,
    save,
  };
}
