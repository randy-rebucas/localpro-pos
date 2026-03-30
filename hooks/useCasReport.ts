import { useCallback, useState } from 'react';

export interface CasDateRange {
  start: string;
  end: string;
}

export function useCasReport() {
  const [casDateRange, setCasDateRange] = useState<CasDateRange>({ start: '', end: '' });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadReport = useCallback(async (onSuccess?: (message: string) => void, onError?: (error: string) => void) => {
    setDownloading(true);
    setError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const params = new URLSearchParams();
      if (casDateRange.start) params.set('startDate', casDateRange.start);
      if (casDateRange.end) params.set('endDate', casDateRange.end);

      const res = await globalThis.fetch(`/api/reports/cas?${params}`, {
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to generate CAS report' }));
        const errorMsg = data.error || 'Failed to generate CAS report';
        setError(errorMsg);
        onError?.(errorMsg);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cas-report${casDateRange.start ? `-${casDateRange.start}` : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onSuccess?.('CAS report downloaded successfully.');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to download CAS report';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      clearTimeout(timeout);
      setDownloading(false);
    }
  }, [casDateRange]);

  return { casDateRange, setCasDateRange, downloading, error, downloadReport };
}
