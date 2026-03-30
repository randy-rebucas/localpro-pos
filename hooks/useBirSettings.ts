import { useCallback, useState } from 'react';

export interface BirSettings {
  birTin: string;
  birPtuNumber: string;
  birPtuIssuedDate: string;
  birPtuExpiryDate: string;
}

export function useBirSettings(tenant: string) {
  const [birSettings, setBirSettings] = useState<BirSettings>({
    birTin: '',
    birPtuNumber: '',
    birPtuIssuedDate: '',
    birPtuExpiryDate: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch(`/api/tenants/${tenant}/bir-settings`, {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorMsg = 'Failed to fetch BIR settings';
        setError(errorMsg);
        onError?.(errorMsg);
        return;
      }

      const data = await res.json();
      if (data.success && data.data) {
        setBirSettings({
          birTin: data.data.birTin || '',
          birPtuNumber: data.data.birPtuNumber || '',
          birPtuIssuedDate: data.data.birPtuIssuedDate
            ? new Date(data.data.birPtuIssuedDate).toISOString().split('T')[0]
            : '',
          birPtuExpiryDate: data.data.birPtuExpiryDate
            ? new Date(data.data.birPtuExpiryDate).toISOString().split('T')[0]
            : '',
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch BIR settings';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant]);

  const saveSettings = useCallback(
    async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
      setSaving(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const res = await globalThis.fetch(`/api/tenants/${tenant}/bir-settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            birTin: birSettings.birTin || undefined,
            birPtuNumber: birSettings.birPtuNumber || undefined,
            birPtuIssuedDate: birSettings.birPtuIssuedDate || undefined,
            birPtuExpiryDate: birSettings.birPtuExpiryDate || undefined,
          }),
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success) {
          onSuccess?.('BIR settings saved successfully.');
        } else {
          const errorMsg = data.error || 'Failed to save BIR settings';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save BIR settings';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setSaving(false);
      }
    },
    [tenant, birSettings]
  );

  return { birSettings, setBirSettings, loading, saving, error, fetchSettings, saveSettings };
}
