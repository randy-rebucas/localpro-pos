'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Currency from './Currency';

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
  onProductClick?: (productId: string) => void;
}

export default function LowStockAlerts({
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds
  onProductClick,
}: LowStockAlertsProps) {
  const params = useParams();
  const tenant = params.tenant as string;
  const [alerts, setAlerts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inventory/low-stock?tenant=${tenant}`);
      const data = await res.json();
      
      if (data.success) {
        setAlerts(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch alerts');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching alerts');
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
  }, [tenant, autoRefresh, refreshInterval]);

  if (loading && alerts.length === 0) {
    return (
      <div className="bg-white border border-gray-300 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 w-1/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200"></div>
            <div className="h-3 bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-300 p-4">
        <p className="text-red-800 text-sm">{error}</p>
        <button
          onClick={fetchAlerts}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-300 p-4">
        <p className="text-green-800 text-sm font-medium">
          ✓ All products are well stocked
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-300">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Low Stock Alerts
          </h3>
          <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 border border-red-300">
            {alerts.length}
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert._id}
            className={`p-4 hover:bg-gray-50 transition-colors ${
              onProductClick ? 'cursor-pointer' : ''
            }`}
            onClick={() => onProductClick?.(alert._id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {alert.name}
                </p>
                {alert.sku && (
                  <p className="text-xs text-gray-500 mt-1">SKU: {alert.sku}</p>
                )}
              </div>
              <div className="ml-4 flex-shrink-0 text-right">
                <div
                  className={`inline-flex items-center px-2.5 py-0.5 border border-gray-300 text-xs font-semibold ${
                    alert.currentStock === 0
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {alert.currentStock} / {alert.threshold}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {alert.currentStock === 0 ? 'Out of stock' : 'Low stock'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

