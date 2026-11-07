'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import SlipPager from '@/components/ui/SlipPager';
import type { TranslationDict } from '@/types/dictionary';

const ALERTS_PER_PAGE = 8;

interface LowStockProduct {
  _id: string;
  name: string;
  currentStock: number;
  threshold: number;
  sku?: string;
}

interface LowStockAlertsProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  /** Filter alerts to a specific branch. Empty string / undefined = all branches. */
  branchId?: string;
  /** Increment to imperatively trigger a refresh (e.g. after an SSE stock update). */
  refreshTrigger?: number;
  onProductClick?: (productId: string) => void;
  /** Reports how many alerts loaded, or null when the fetch failed. */
  onCountChange?: (count: number | null) => void;
  /** Drop the frame and heading so the parent can supply its own. */
  embedded?: boolean;
}

export default function LowStockAlerts({
  autoRefresh = true,
  // Stock changes already arrive through refreshTrigger (SSE), so the timer is
  // only a fallback — every poll costs database reads.
  refreshInterval = 5 * 60 * 1000, // 5 minutes
  branchId,
  refreshTrigger,
  onProductClick,
  onCountChange,
  embedded = false,
}: LowStockAlertsProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [alerts, setAlerts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const frame = embedded ? 'flex flex-1 flex-col' : 'bg-white border border-gray-300';
  // A refresh can shorten the list, so never stay past the last page
  const totalPages = Math.max(1, Math.ceil(alerts.length / ALERTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = new URL(`/api/inventory/low-stock`, window.location.origin);
      url.searchParams.set('tenant', tenant);
      if (branchId) url.searchParams.set('branchId', branchId);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.success) {
        setAlerts(data.data || []);
        onCountChange?.((data.data || []).length);
      } else {
        setError(data.error || dict?.common?.failedToFetchAlerts || 'Failed to fetch alerts');
        onCountChange?.(null);
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(err.message || dict?.common?.errorFetchingAlerts || 'Error fetching alerts');
      onCountChange?.(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [branchId]);

  useEffect(() => {
    fetchAlerts();

    if (autoRefresh) {
      // Skip polls while the tab is in the background
      const interval = setInterval(() => {
        if (!document.hidden) fetchAlerts();
      }, refreshInterval);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, branchId, autoRefresh, refreshInterval, refreshTrigger]);

  if (loading && alerts.length === 0) {
    return (
      <div className={frame}>
        <LoadingSpinner size="sm" className="py-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={frame}>
        <ErrorState
          title={error}
          onRetry={fetchAlerts}
          retryLabel={dict?.common?.retry || 'Retry'}
          compact
          className="py-4"
        />
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className={frame}>
        <EmptyState
          icon="products"
          title={
            dict?.components?.lowStockAlerts?.allProductsWellStocked ||
            'All products are well stocked'
          }
          compact
          className="py-4"
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      {!embedded && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              {dict?.components?.lowStockAlerts?.title || 'Low Stock Alerts'}
            </h3>
            <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 border border-red-300">
              {alerts.length}
            </span>
          </div>
        </div>
      )}
      <ul className="divide-y divide-dashed divide-ink/20">
        {alerts.slice((currentPage - 1) * ALERTS_PER_PAGE, currentPage * ALERTS_PER_PAGE).map((alert) => {
          const outOfStock = alert.currentStock === 0;
          const line = (
            <>
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{alert.name}</span>
                <span className="mk-leader flex-1" aria-hidden />
                <span className="whitespace-nowrap font-receipt text-sm font-semibold">
                  {alert.currentStock} / {alert.threshold}
                </span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-3 font-receipt text-xs text-ink/60">
                <span className="min-w-0 truncate">{alert.sku ? `SKU: ${alert.sku}` : ''}</span>
                <span className={`shrink-0 whitespace-nowrap border px-2 py-0.5 uppercase ${outOfStock ? 'border-stamp font-semibold text-stamp' : 'border-ink/25 text-ink/70'}`}>
                  {outOfStock ? (dict?.admin?.outOfStock || 'Out of stock') : (dict?.admin?.lowStock || 'Low stock')}
                </span>
              </span>
            </>
          );

          return (
            <li key={alert._id}>
              {onProductClick ? (
                <button
                  type="button"
                  onClick={() => onProductClick(alert._id)}
                  className="block w-full px-4 py-3 text-left text-ink transition-colors hover:bg-paper sm:px-5"
                >
                  {line}
                </button>
              ) : (
                <div className="px-4 py-3 text-ink sm:px-5">{line}</div>
              )}
            </li>
          );
        })}
      </ul>
      <SlipPager
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        label={dict?.admin?.page || 'Page'}
        previousLabel={dict?.common?.previous || 'Previous'}
        nextLabel={dict?.common?.next || 'Next'}
      />
    </div>
  );
}

