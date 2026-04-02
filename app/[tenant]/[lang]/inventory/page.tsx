'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PageTitle from '@/components/PageTitle';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import { getDictionaryClient } from '../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType, supportsFeature } from '@/lib/business-type-helpers';

interface Branch {
  _id: string;
  name: string;
  code?: string;
}

interface StockPrediction {
  productId: string;
  name: string;
  image: string | null;
  category: string | null;
  currentStock: number;
  avgDailySales: number;
  daysUntilStockout: number;
}

export default function InventoryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#3b82f6';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);

  const [stockPredictions, setStockPredictions] = useState<StockPrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);

  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBranches();
    fetchStockPredictions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const fetchBranches = async () => {
    try {
      setBranchLoading(true);
      const res = await fetch(`/api/branches?tenant=${tenant}&isActive=true`);
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setBranchLoading(false);
    }
  };

  const fetchStockPredictions = async () => {
    try {
      setPredictionsLoading(true);
      const res = await fetch(`/api/insights/stock-predictions?tenant=${tenant}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) setStockPredictions(data.data as StockPrediction[]);
    } catch {
      // non-critical
    } finally {
      setPredictionsLoading(false);
    }
  };

  const handleStockUpdate = useCallback(() => {
    setStockRefreshTrigger((n) => n + 1);
  }, []);

  if (!dict) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
        </div>
      </div>
    );
  }

  // Inventory not enabled for this business type
  if (!inventoryEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <PageTitle />
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {dict?.inventory?.title || 'Inventory'}
            </h1>
          </div>
          <div className="bg-yellow-50 border border-yellow-300 p-5 sm:p-6 flex gap-4">
            <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold text-yellow-900 mb-1">Inventory Management Not Available</p>
              <p className="text-sm text-yellow-800">
                Inventory tracking is not enabled for {businessTypeConfig?.name || 'your business type'}.
                To enable it, update your business type in Settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Page Header */}
        <PageTitle />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {dict?.inventory?.title || 'Inventory'}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            {/* Branch filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
                {dict?.inventory?.branch || 'Branch'}:
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                disabled={branchLoading}
                className="text-sm bg-white border border-gray-300 px-3 py-2 disabled:opacity-50 transition-all min-w-[140px]"
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <option value="">
                  {branchLoading ? (dict?.common?.loading || 'Loading…') : (dict?.inventory?.allBranches || 'All Branches')}
                </option>
                {branches.map((branch) => (
                  <option key={branch._id} value={branch._id}>
                    {branch.name}{branch.code ? ` (${branch.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Live indicator */}
            <div className="bg-white border border-gray-300 px-3 py-2 flex items-center">
              <RealTimeStockTracker
                branchId={selectedBranch || undefined}
                onStockUpdate={handleStockUpdate}
              />
            </div>
          </div>
        </div>

        {/* Main content + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Low Stock Alerts — main panel */}
          <div className="lg:col-span-2">
            <LowStockAlerts
              autoRefresh={true}
              refreshInterval={30000}
              branchId={selectedBranch || undefined}
              refreshTrigger={stockRefreshTrigger}
              onProductClick={(productId) => {
                window.location.href = `/${tenant}/${lang}/products?edit=${productId}`;
              }}
            />
          </div>

          {/* Sidebar — Quick Actions */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  {dict?.inventory?.quickActions || 'Quick Actions'}
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                <a
                  href={`/${tenant}/${lang}/products`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{dict?.nav?.products || 'Products'}</p>
                    <p className="text-xs text-gray-500">{dict?.inventory?.manageStock || 'Manage stock & refill'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>

                <a
                  href={`/${tenant}/${lang}/admin/stock-movements`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{dict?.nav?.stockMovements || 'Stock Movements'}</p>
                    <p className="text-xs text-gray-500">{dict?.inventory?.viewHistory || 'View movement history'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>

                <a
                  href={`/${tenant}/${lang}/admin/bundles`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-8 h-8 flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{dict?.nav?.bundles || 'Bundles'}</p>
                    <p className="text-xs text-gray-500">{dict?.inventory?.manageBundles || 'Manage product bundles'}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            </div>

            {/* AI Stock Predictions */}
            <div className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                  <svg className="w-4 h-4" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Predicted Stockouts
                </h2>
                <button
                  type="button"
                  onClick={fetchStockPredictions}
                  disabled={predictionsLoading}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
                  title="Refresh predictions"
                >
                  <svg className={`w-4 h-4 ${predictionsLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              {predictionsLoading ? (
                <div className="px-4 py-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                </div>
              ) : stockPredictions.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <svg className="w-8 h-8 text-green-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-500">No stockouts predicted in the next 14 days</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {stockPredictions.map((p) => (
                    <li key={p.productId} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 flex-shrink-0 bg-gray-100 overflow-hidden">
                        {p.image ? (
                          <img // eslint-disable-line
                            src={p.image}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {p.currentStock} left · ~{p.avgDailySales}/day sold
                        </p>
                      </div>
                      <span
                        className={`flex-shrink-0 text-xs font-bold px-2 py-1 border whitespace-nowrap ${
                          p.daysUntilStockout <= 3
                            ? 'bg-red-50 text-red-700 border-red-300'
                            : p.daysUntilStockout <= 7
                            ? 'bg-orange-50 text-orange-700 border-orange-300'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                        }`}
                      >
                        {p.daysUntilStockout}d
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Feature Summary */}
            <div className="bg-white border border-gray-300">
              <div className="px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  {dict?.inventory?.features || 'Features'}
                </h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {[
                  { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: dict?.inventory?.realtimeTracking || 'Real-time tracking' },
                  { icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9', label: dict?.inventory?.lowStockAlerts || 'Low stock alerts' },
                  { icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', label: dict?.inventory?.bundledProducts || 'Bundled products' },
                  { icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z', label: dict?.inventory?.multiBranch || 'Multi-branch support' },
                ].map(({ icon, label }, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <svg className="w-4 h-4 flex-shrink-0" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                    </svg>
                    <span className="text-sm text-gray-700">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
