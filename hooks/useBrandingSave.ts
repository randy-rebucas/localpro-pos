import { useState, useCallback } from 'react';
import { ITenantSettings } from '@/models/Tenant';

export function useBrandingSave(tenant: string) {
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
        body: JSON.stringify({ settings }),
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
  }, [tenant]);

  return {
    saving,
    message,
    save,
  };
}
