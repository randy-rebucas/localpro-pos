'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import PageLoading from '@/components/ui/PageLoading';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import InlineBanner from '@/components/ui/InlineBanner';
import LowStockAlerts from '@/components/LowStockAlerts';
import RealTimeStockTracker from '@/components/RealTimeStockTracker';
import { getDictionaryClient } from '../../dictionaries-client';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType, supportsFeature } from '@/lib/business-type-helpers';
import { useInventoryPage } from '@/hooks/useInventoryPage';
import type { TranslationDict } from '@/types/dictionary';

export default function AdminInventoryPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [stockRefreshTrigger, setStockRefreshTrigger] = useState(0);

  const {
    branches,
    branchesStatus,
    branchesError,
    refetchBranches,
    stockPredictions,
    predictionsStatus,
    predictionsError,
    refetchPredictions,
  } = useInventoryPage(tenant);

  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  const handleStockUpdate = useCallback(() => {
    setStockRefreshTrigger((n) => n + 1);
  }, []);

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const invDict = dict.inventory ?? {};

  if (!inventoryEnabled) {
    return (
      <div className="px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{invDict.title || 'Inventory'}</h1>
        </div>
        <InlineBanner
          variant="warning"
          message={invDict.inventoryNotAvailable || 'Inventory Management Not Available'}
          className="border border-yellow-300 bg-yellow-50 text-yellow-900"
        />
        <p className="mt-3 text-sm text-yellow-800">
          {invDict.inventoryNotAvailableDesc ||
            `Inventory tracking is not enabled for ${businessTypeConfig?.name || 'your business type'}. To enable it, update your business type in Settings.`}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{invDict.title || 'Inventory'}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
              {invDict.branch || 'Branch'}:
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={branchesStatus === 'loading'}
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
                {branchesStatus === 'loading'
                  ? dict.common.loading || 'Loading…'
                  : invDict.allBranches || 'All Branches'}
              </option>
              {branches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                  {branch.code ? ` (${branch.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-gray-300 px-3 py-2 flex items-center">
            <RealTimeStockTracker
              branchId={selectedBranch || undefined}
              onStockUpdate={handleStockUpdate}
            />
          </div>
        </div>
      </div>

      {branchesStatus === 'error' && (
        <div className="mb-4">
          <InlineBanner
            variant="warning"
            message={branchesError || invDict.failedToLoadBranches || 'Failed to load branches'}
            onRetry={refetchBranches}
            retryLabel={dict.common.retry || 'Retry'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <LowStockAlerts
            autoRefresh={true}
            refreshInterval={30000}
            branchId={selectedBranch || undefined}
            refreshTrigger={stockRefreshTrigger}
            onProductClick={(productId) => {
              window.location.href = `/${tenant}/${lang}/admin/products?edit=${productId}`;
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-300">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {invDict.quickActions || 'Quick Actions'}
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              <a
                href={`/${tenant}/${lang}/admin/products`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className="w-8 h-8 flex items-center justify-center border border-gray-200 group-hover:border-gray-300 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{dict.nav?.products || 'Products'}</p>
                  <p className="text-xs text-gray-500">{invDict.manageStock || 'Manage stock & refill'}</p>
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
                  <p className="text-sm font-medium text-gray-900">{dict.nav?.stockMovements || 'Stock Movements'}</p>
                  <p className="text-xs text-gray-500">{invDict.viewHistory || 'View movement history'}</p>
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
                  <p className="text-sm font-medium text-gray-900">{dict.nav?.bundles || 'Bundles'}</p>
                  <p className="text-xs text-gray-500">{invDict.manageBundles || 'Manage product bundles'}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          <div className="bg-white border border-gray-300">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                <svg className="w-4 h-4" style={{ color: primaryColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {invDict.predictedStockouts || 'Predicted Stockouts'}
              </h2>
              <button
                type="button"
                onClick={refetchPredictions}
                disabled={predictionsStatus === 'loading'}
                className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
                title={invDict.refreshPredictions || 'Refresh predictions'}
              >
                <svg
                  className={`w-4 h-4 ${predictionsStatus === 'loading' ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            {predictionsStatus === 'loading' ? (
              <LoadingSpinner size="sm" className="py-6" />
            ) : predictionsStatus === 'error' ? (
              <ErrorState
                title={invDict.failedToLoadPredictions || 'Failed to load predictions'}
                description={predictionsError || undefined}
                onRetry={refetchPredictions}
                retryLabel={dict.common.retry || 'Retry'}
                compact
                className="py-4"
              />
            ) : stockPredictions.length === 0 ? (
              <EmptyState
                icon="products"
                title={invDict.noStockoutsPredicted || 'No stockouts predicted in the next 14 days'}
                compact
                className="py-4"
              />
            ) : (
              <ul className="divide-y divide-gray-100">
                {stockPredictions.map((p) => (
                  <li key={p.productId} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 flex-shrink-0 bg-gray-100 overflow-hidden">
                      {p.image ? (
                        <img // eslint-disable-line
                          src={p.image}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
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

          <div className="bg-white border border-gray-300">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {invDict.features || 'Features'}
              </h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {[
                { icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: invDict.realtimeTracking || 'Real-time tracking' },
                {
                  icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
                  label: invDict.lowStockAlerts || 'Low stock alerts',
                },
                {
                  icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
                  label: invDict.bundledProducts || 'Bundled products',
                },
                {
                  icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
                  label: invDict.multiBranch || 'Multi-branch support',
                },
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
  );
}
