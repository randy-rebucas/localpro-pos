import { useCallback, useState } from 'react';

export interface BundlesAnalytics {
  topBundles: Array<{
    _id: string;
    name: string;
    totalSale: number;
    quantity: number;
  }>;
  analytics: Array<{
    bundleId: string;
    bundleName: string;
    totalRevenue: number;
    unitsSold: number;
    averageOrderValue: number;
  }>;
  summary: {
    totalBundles: number;
    totalSales: number;
    totalQuantity: number;
    totalTransactions: number;
    totalRevenue: number;
    totalUnitsSold: number;
    averageOrderValue: number;
    percentage: number;
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
          const analyticsData = data.data;
          
          // Calculate missing summary fields
          const calculatedSummary = {
            ...analyticsData.summary,
            totalBundles: analyticsData.analytics?.length || 0,
            totalSales: analyticsData.analytics?.reduce((sum: number, item: any) => sum + (item.totalRevenue || 0), 0) || 0, // eslint-disable-line @typescript-eslint/no-explicit-any
            totalQuantity: analyticsData.analytics?.reduce((sum: number, item: any) => sum + (item.unitsSold || 0), 0) || 0, // eslint-disable-line @typescript-eslint/no-explicit-any
            totalTransactions: analyticsData.analytics?.length || 0,
          };
          
          setAnalytics({
            ...analyticsData,
            summary: calculatedSummary,
          });
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
