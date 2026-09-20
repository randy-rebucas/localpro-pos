import { useCallback, useState } from 'react';

export interface Rider {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  riderVehicleType?: string | null;
  riderLicenseNumber?: string | null;
  riderCurrentLatitude?: string | number | null;
  riderCurrentLongitude?: string | number | null;
  riderLocationUpdatedAt?: string | null;
}

export function useRiderList(tenant: string) {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRiders = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch(`/api/delivery/riders?tenant=${tenant}&isActive=true`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setRiders(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch riders';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch riders';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant]);

  return { riders, loading, error, fetchRiders };
}
