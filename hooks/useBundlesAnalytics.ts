import { useCallback, useState } from 'react';

export interface BundlesAnalytics {
  analytics: Array<{
    bundleId: string;
    bundleName: string;
    bundlePrice: number;
    totalSales: number;
    totalQuantity: number;
    transactionCount: number;
    averageOrderValue: number;
    averageQuantity: number;
    revenuePerUnit: number;
  }>;
  summary: {
    totalBundles: number;
    totalSales: number;
    totalQuantity: number;
    totalTransactions: number;
  };
}

export function useBundlesAnalytics() {
  const [analytics, setAnalytics] = useState<BundlesAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (startDate: string, endDate: string, onError?: (error: string) => void) => {
      if (!startDate || !endDate) return;

      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const params = new URLSearchParams();
        params.append('startDate', startDate);
        params.append('endDate', endDate);

        const res = await globalThis.fetch(`/api/bundles/analytics?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        });

        const data = await res.json();

        if (data.success && data.data) {
          // The API already computes an accurate summary (totalBundles,
          // totalSales, totalQuantity, totalTransactions) — use it as-is.
          setAnalytics(data.data);
        } else {
          const errorMsg = data.error || 'Failed to fetch analytics';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to fetch analytics';
        setError(errorMsg);
        onError?.(errorMsg);
      } finally {
        clearTimeout(timeout);
        setLoading(false);
      }
    },
    []
  );

  return { analytics, loading, error, fetchAnalytics };
}
