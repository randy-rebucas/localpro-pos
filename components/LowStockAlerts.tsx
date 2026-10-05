'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '@/app/[tenant]/[lang]/dictionaries-client';
import type { TranslationDict } from '@/types/dictionary';
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
}

export default function LowStockAlerts({
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  branchId,
  refreshTrigger,
  onProductClick,
}: LowStockAlertsProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = (params?.lang as 'en' | 'es') || 'en';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [alerts, setAlerts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        setError(data.error || dict?.common?.failedToFetchAlerts || 'Failed to fetch alerts');
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setError(err.message || dict?.common?.errorFetchingAlerts || 'Error fetching alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    if (autoRefresh) {
      const interval = setInterval(fetchAlerts, refreshInterval);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, branchId, autoRefresh, refreshInterval, refreshTrigger]);

  const renderBody = () => {
    if (loading && alerts.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict?.common?.loading || 'Loading…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12" role="alert">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={fetchAlerts}
            className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors"
          >
            {dict?.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (alerts.length === 0) {
      return (
        <p className="px-4 py-12 text-center text-sm text-gray-400">
          {dict?.components?.lowStockAlerts?.allProductsWellStocked || 'All products are well stocked'}
        </p>
      );
    }

    return (
      <ul className="divide-y divide-gray-200 max-h-[70vh] overflow-y-auto">
        {alerts.map((alert) => {
          const out = alert.currentStock === 0;
          const content = (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{alert.name}</p>
                {alert.sku && <p className="text-xs text-gray-400 font-mono mt-0.5">{alert.sku}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <span className={`inline-block px-2 py-0.5 text-xs font-semibold text-white tabular-nums ${out ? 'bg-win8-danger' : 'bg-win8-warning'}`}>
                  {alert.currentStock.toLocaleString()} / {alert.threshold.toLocaleString()}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {out ? (dict?.common?.outOfStock || 'Out of stock') : (dict?.common?.lowStock || 'Low stock')}
                </p>
              </div>
            </>
          );
          return (
            <li key={alert._id}>
              {onProductClick ? (
                <button
                  type="button"
                  onClick={() => onProductClick(alert._id)}
                  className="w-full text-left px-4 py-3 flex items-start justify-between gap-4 hover:bg-gray-100 transition-colors"
                >
                  {content}
                </button>
              ) : (
                <div className="px-4 py-3 flex items-start justify-between gap-4">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <section className="bg-white border border-gray-300">
      <div className="px-4 py-3 border-b border-gray-300 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">
          {dict?.components?.lowStockAlerts?.title || 'Low Stock Alerts'}
        </h2>
        {alerts.length > 0 && !error && (
          <span className="px-2 py-0.5 text-xs font-semibold bg-win8-danger text-white tabular-nums">
            {alerts.length.toLocaleString()}
          </span>
        )}
      </div>
      {renderBody()}
    </section>
  );
}
