'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import KPICards from '@/components/dashboard/KPICards';
import SalesTrendChart from '@/components/dashboard/SalesTrendChart';
import TopProductsTable from '@/components/dashboard/TopProductsTable';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';

interface DashboardData {
  today: { revenue: number; transactions: number; avgOrderValue: number; totalDiscount: number };
  month: { revenue: number; transactions: number };
  salesTrend: { date: string; revenue: number; transactions: number }[];
  topProducts: { _id: string; name: string; revenue: number; quantity: number }[];
  alerts: { lowStock: number; pendingBookings: number; activeStaff: number };
  generatedAt: string;
}

export default function DashboardPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as string;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { settings } = useTenantSettings();
  const currency = (settings || getDefaultTenantSettings()).currency || 'PHP';

  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error || 'Failed to load dashboard');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            {data?.generatedAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={() => { setLoading(true); setError(''); fetch('/api/dashboard/summary').then(r => r.json()).then(res => { if (res.success) setData(res.data); }).finally(() => setLoading(false)); }}
            className="px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-sm">Loading dashboard...</div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <KPICards data={data} currency={currency} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SalesTrendChart data={data.salesTrend} currency={currency} />
              <TopProductsTable products={data.topProducts} currency={currency} />
            </div>

            {/* Alert strip */}
            {(data.alerts.lowStock > 0 || data.alerts.pendingBookings > 0) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex flex-wrap gap-4 text-sm">
                {data.alerts.lowStock > 0 && (
                  <a href={`/${tenant}/${lang}/admin/stock-movements`} className="text-yellow-800 hover:underline">
                    ⚠ {data.alerts.lowStock} products below reorder threshold
                  </a>
                )}
                {data.alerts.pendingBookings > 0 && (
                  <a href={`/${tenant}/${lang}/admin/bookings`} className="text-yellow-800 hover:underline">
                    📅 {data.alerts.pendingBookings} pending bookings today
                  </a>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
