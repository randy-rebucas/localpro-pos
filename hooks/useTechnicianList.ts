import { useCallback, useState } from 'react';

export interface Technician {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

export function useTechnicianList(tenant: string) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTechnicians = useCallback(async (onError?: (error: string) => void) => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await globalThis.fetch(`/api/work-orders/technicians?tenant=${tenant}&isActive=true`, {
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await res.json();

      if (data.success) {
        setTechnicians(data.data || []);
      } else {
        const errorMsg = data.error || 'Failed to fetch technicians';
        setError(errorMsg);
        onError?.(errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch technicians';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [tenant]);

  return { technicians, loading, error, fetchTechnicians };
}
