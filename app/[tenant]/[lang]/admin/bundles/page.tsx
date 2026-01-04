'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } from '@/lib/export';
import dynamic from 'next/dynamic';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import type { BundleAnalytics } from '@/components/BundlePerformanceCharts';

// Dynamically import charts to avoid SSR issues
const BundlePerformanceCharts = dynamic(() => import('@/components/BundlePerformanceCharts'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-64 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">{'Loading chart...'}</p>
      </div>
    </div>
  ),
});

interface BundleItem {
  productId: string | { _id: string; name: string; price: number; stock: number };
  productName: string;
  quantity: number;
  variation?: {
    size?: string;
    color?: string;
    type?: string;
  };
}

interface Bundle {
  _id: string;
  name: string;
  description?: string;
  price: number;
  items: BundleItem[];
  sku?: string;
  categoryId?: string | { _id: string; name: string };
  trackInventory: boolean;
  isActive: boolean;
  createdAt: string;
}

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  hasVariations: boolean;
  variations?: Array<Record<string, unknown>>;
  sku?: string;
  description?: string;
}

interface Category {
  _id: string;
  name: string;
}

export default function BundlesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, unknown> | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [selectedBundles, setSelectedBundles] = useState<Set<string>>(new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const { settings } = useTenantSettings();
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const bundlesAllowed = businessTypeConfig?.productTypes?.includes('bundle') ?? true;

  const fetchBundles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterActive !== null) params.append('isActive', filterActive.toString());
      if (filterCategory) params.append('categoryId', filterCategory);
      if (filterMinPrice) params.append('minPrice', filterMinPrice);
      if (filterMaxPrice) params.append('maxPrice', filterMaxPrice);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);
      
      const res = await fetch(`/api/bundles?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setBundles(data.data);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToFetchBundles as string || 'Failed to fetch bundles' });
      }
    } catch (error) {
      console.error('Error fetching bundles:', error);
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToFetchBundles as string || 'Failed to fetch bundles' });
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterActive, filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate, dict]);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProducts(data.data || []);
      } else {
        console.error('Error fetching products:', data.error);
        setProducts([]);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      } else {
        console.error('Error fetching categories:', data.error);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (!analyticsStartDate || !analyticsEndDate) return;
    
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('startDate', analyticsStartDate);
      params.append('endDate', analyticsEndDate);
      
      const res = await fetch(`/api/bundles/analytics?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.data);
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToFetchAnalytics as string || 'Failed to fetch analytics' });
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToFetchAnalytics as string || 'Failed to fetch analytics' });
    } finally {
      setAnalyticsLoading(false);
    }
  }, [analyticsStartDate, analyticsEndDate, dict]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchBundles();
    fetchProducts();
    fetchCategories();
    // Set default analytics date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setAnalyticsEndDate(end.toISOString().split('T')[0]);
    setAnalyticsStartDate(start.toISOString().split('T')[0]);
  }, [lang, tenant, fetchBundles, fetchProducts, fetchCategories]);

  useEffect(() => {
    if (showAnalytics && analyticsStartDate && analyticsEndDate) {
      fetchAnalytics();
    }
  }, [showAnalytics, analyticsStartDate, analyticsEndDate, fetchAnalytics]);

  useEffect(() => {
    if (!loading) {
      fetchBundles();
    }
  }, [searchTerm, filterActive, filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate, loading, fetchBundles]);

  const handleDeleteBundle = async (bundleId: string) => {
    if (!confirm((dict?.admin as Record<string, unknown>)?.deleteBundleConfirm as string || 'Are you sure you want to delete this bundle?')) return;
    try {
      const res = await fetch(`/api/bundles/${bundleId}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: (dict?.admin as Record<string, unknown>)?.deleteBundleSuccess as string || 'Bundle deleted successfully' });
        fetchBundles();
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.admin as Record<string, unknown>)?.deleteBundleError as string || 'Failed to delete bundle' });
      }
    } catch {
      setMessage({ type: 'error', text: (dict?.admin as Record<string, unknown>)?.deleteBundleError as string || 'Failed to delete bundle' });
    }
  };

  const handleToggleStatus = async (bundle: Bundle) => {
    try {
      const res = await fetch(`/api/bundles/${bundle._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !bundle.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        const adminDict = dict?.admin as Record<string, unknown>;
        setMessage({ type: 'success', text: `Bundle ${!bundle.isActive ? (adminDict?.activated as string || 'activated') : (adminDict?.deactivated as string || 'deactivated')} ${adminDict?.successfully as string || 'successfully'}` });
        fetchBundles();
      } else {
        setMessage({ type: 'error', text: data.error || (dict?.common as Record<string, unknown>)?.failedToUpdateBundle as string || 'Failed to update bundle' });
      }
    } catch {
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.failedToUpdateBundle as string || 'Failed to update bundle' });
    }
  };

  const handleBulkOperation = async (action: 'activate' | 'deactivate') => {
    if (selectedBundles.size === 0) {
      setMessage({ type: 'error', text: (dict?.common as Record<string, unknown>)?.selectAtLeastOneBundle as string || 'Please select at least one bundle' });
      return;
    }

    const bulkActionConfirm = (dict?.common as Record<string, unknown>)?.bulkActionBundleConfirm as string;
    const confirmText = bulkActionConfirm?.replace('{action}', action).replace('{count}', selectedBundles.size.toString()) || `Are you sure you want to ${action} ${selectedBundles.size} bundle(s)?`;
    if (!confirm(confirmText)) {
      return;
    }

    try {
      const res = await fetch('/api/bundles/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bundleIds: Array.from(selectedBundles),
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || `Bundles ${action}d successfully` });
        setSelectedBundles(new Set());
        fetchBundles();
      } else {
        setMessage({ type: 'error', text: data.error || `Failed to ${action} bundles` });
      }
    } catch {
      setMessage({ type: 'error', text: `Failed to ${action} bundles` });
    }
  };

  const handleSelectAll = () => {
    if (selectedBundles.size === bundles.length) {
      setSelectedBundles(new Set());
    } else {
      setSelectedBundles(new Set(bundles.map(b => b._id)));
    }
  };

  const handleSelectBundle = (bundleId: string) => {
    const newSelected = new Set(selectedBundles);
    if (newSelected.has(bundleId)) {
      newSelected.delete(bundleId);
    } else {
      newSelected.add(bundleId);
    }
    setSelectedBundles(newSelected);
  };

  const handleExport = (format: 'csv' | 'excel' | 'pdf' = 'csv') => {
    const headers = [
      'Name',
      'SKU',
      'Category',
      'Price',
      'Items Count',
      'Status',
      'Description',
      'Created At',
    ];
    
    const exportData = bundles.map(bundle => ({
      Name: bundle.name,
      SKU: bundle.sku || '',
      Category: typeof bundle.categoryId === 'object' && bundle.categoryId?.name ? bundle.categoryId.name : '',
      Price: bundle.price,
      'Items Count': bundle.items.length,
      Status: bundle.isActive ? 'Active' : 'Inactive',
      Description: bundle.description || '',
      'Created At': new Date(bundle.createdAt).toLocaleString(),
    }));

    const baseFilename = `bundles_export_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'csv') {
      const csv = arrayToCSV(exportData, headers);
      downloadCSV(csv, `${baseFilename}.csv`);
    } else if (format === 'excel') {
      downloadExcel(exportData, headers, baseFilename);
    } else if (format === 'pdf') {
      downloadPDF(exportData, headers, baseFilename, (dict?.admin as Record<string, unknown>)?.bundle as string || 'Bundles');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterActive(null);
    setFilterCategory('');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {(dict?.admin as Record<string, unknown>)?.backToAdmin as string || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {(dict?.admin as Record<string, unknown>)?.bundle as string || 'Product Bundles'}
              </h1>
              <p className="text-gray-600">{(dict?.admin as Record<string, unknown>)?.bundleDescription as string || 'Manage product bundles and packages'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        {!bundlesAllowed && (
          <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-300 text-yellow-800">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Bundles Not Available
                </h3>
                <p className="text-yellow-800">
                  Product bundles are not available for {businessTypeConfig?.name || 'your business type'}. 
                  This feature is typically used for retail and restaurant businesses.
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  If you need bundles, please update your business type in Settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bundle Analytics Section */}
        <div className="bg-white border border-gray-300 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">{(dict?.admin as Record<string, unknown>)?.bundleAnalytics as string || 'Bundle Analytics'}</h2>
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
            >
              {showAnalytics ? ((dict?.common as Record<string, unknown>)?.hide as string || 'Hide') : ((dict?.admin as Record<string, unknown>)?.viewAnalytics as string || 'View Analytics')}
            </button>
          </div>
          {showAnalytics && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict?.reports as Record<string, unknown>)?.startDate as string || 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={analyticsStartDate}
                    onChange={(e) => setAnalyticsStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict?.reports as Record<string, unknown>)?.endDate as string || 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={analyticsEndDate}
                    onChange={(e) => setAnalyticsEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={fetchAnalytics}
                    className="w-full px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
                  >
                    {(dict?.admin as Record<string, unknown>)?.loadAnalytics as string || 'Load Analytics'}
                  </button>
                </div>
              </div>
              
              {analyticsLoading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">{(dict?.common as Record<string, unknown>)?.loading as string || 'Loading...'}</p>
                </div>
              ) : analytics !== null ? (() => {
                const analyticsData = analytics as Record<string, unknown>;
                const summary = analyticsData.summary as Record<string, unknown>;
                const analyticsList = analyticsData.analytics as Array<Record<string, unknown>>;
                return (
                <div>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 border border-blue-200 p-4">
                      <div className="text-sm text-blue-600 mb-1">{(dict?.admin as Record<string, unknown>)?.totalBundles as string || 'Total Bundles'}</div>
                      <div className="text-2xl font-bold text-blue-900">{String(summary?.totalBundles as number || 0)}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 p-4">
                      <div className="text-sm text-green-600 mb-1">{(dict?.admin as Record<string, unknown>)?.totalSales as string || 'Total Sales'}</div>
                      <div className="text-2xl font-bold text-green-900">
                        <Currency amount={summary?.totalSales as number || 0} />
                      </div>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 p-4">
                      <div className="text-sm text-purple-600 mb-1">{(dict?.admin as Record<string, unknown>)?.totalQuantity as string || 'Total Quantity'}</div>
                      <div className="text-2xl font-bold text-purple-900">{String(summary?.totalQuantity as number || 0)}</div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 p-4">
                      <div className="text-sm text-orange-600 mb-1">{(dict?.admin as Record<string, unknown>)?.totalTransactions as string || 'Transactions'}</div>
                      <div className="text-2xl font-bold text-orange-900">{String(summary?.totalTransactions as number || 0)}</div>
                    </div>
                  </div>

                  {/* Bundle Performance Charts */}
                  {analyticsList && analyticsList.length > 0 && (
                    <BundlePerformanceCharts analytics={analyticsList as unknown as BundleAnalytics[]} dict={dict} />
                  )}

                  {/* Analytics Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.bundle as string || 'Bundle'}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.price as string || 'Price'}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.totalSales as string || 'Total Sales'}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.quantity as string || 'Quantity'}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.transactions as string || 'Transactions'}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.avgOrderValue as string || 'Avg Order Value'}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {analyticsList.map((item: Record<string, unknown>) => (
                          <tr key={item.bundleId as string}>
                            <td className="px-4 py-4 text-sm font-medium text-gray-900">{item.bundleName as string}</td>
                            <td className="px-4 py-4 text-sm text-gray-500"><Currency amount={item.bundlePrice as number || 0} /></td>
                            <td className="px-4 py-4 text-sm font-medium text-gray-900"><Currency amount={item.totalSales as number || 0} /></td>
                            <td className="px-4 py-4 text-sm text-gray-500">{String(item.totalQuantity as number || 0)}</td>
                            <td className="px-4 py-4 text-sm text-gray-500">{String(item.transactionCount as number || 0)}</td>
                            <td className="px-4 py-4 text-sm text-gray-500"><Currency amount={item.averageOrderValue as number || 0} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {analyticsList.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        {(dict?.admin as Record<string, unknown>)?.noAnalyticsData as string || 'No sales data for selected period'}
                      </div>
                    )}
                  </div>
                </div>
                );
              })() : null}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder={(dict?.common as Record<string, unknown>)?.search as string || 'Search bundles...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterActive === null ? 'all' : filterActive.toString()}
                onChange={(e) => {
                  const value = e.target.value;
                  setFilterActive(value === 'all' ? null : value === 'true');
                }}
                className="px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">{(dict.common as Record<string, unknown>)?.all as string || 'All'}</option>
                <option value="true">{(dict.admin as Record<string, unknown>)?.active as string || 'Active'}</option>
                <option value="false">{(dict?.admin as Record<string, unknown>)?.inactive as string || 'Inactive'}</option>
              </select>
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
              >
                {(dict.admin as Record<string, unknown>)?.advancedFilters as string || 'Advanced Filters'}
              </button>
              <div className="relative group">
                <button
                  onClick={() => handleExport('csv')}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
                >
                  {(dict?.admin as Record<string, unknown>)?.export as string || 'Export'} ▼
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 shadow-lg hidden group-hover:block z-10">
                  <button
                    onClick={() => handleExport('csv')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {(dict?.admin as Record<string, unknown>)?.exportCSV as string || 'Export CSV'}
                  </button>
                  <button
                    onClick={() => handleExport('excel')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {(dict.admin as Record<string, unknown>)?.exportExcel as string || 'Export Excel'}
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                  >
                    {(dict.admin as Record<string, unknown>)?.exportPDF as string || 'Export PDF'}
                  </button>
                </div>
              </div>
              {bundlesAllowed && (
                <button
                  onClick={() => {
                    setEditingBundle(null);
                    setShowBundleModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 font-medium border border-blue-700"
                >
                  {(dict.common as Record<string, unknown>)?.add as string || 'Add'} {(dict.admin as Record<string, unknown>)?.bundle as string || 'Bundle'}
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict.admin as Record<string, unknown>)?.category as string || 'Category'}
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">{(dict.common as Record<string, unknown>)?.all as string || 'All'}</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict?.admin as Record<string, unknown>)?.minPrice as string || 'Min Price'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict.admin as Record<string, unknown>)?.maxPrice as string || 'Max Price'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    placeholder="999999.99"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict?.reports as Record<string, unknown>)?.startDate as string || 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {(dict?.reports as Record<string, unknown>)?.endDate as string || 'End Date'}
                  </label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="w-full px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white"
                  >
                    {(dict.common as Record<string, unknown>)?.clear as string || 'Clear'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Actions */}
          {selectedBundles.size > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">
                {selectedBundles.size} {(dict.admin as Record<string, unknown>)?.selected as string || 'selected'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkOperation('activate')}
                  className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-sm"
                >
                  {(dict.admin as Record<string, unknown>)?.bulkActivate as string || 'Activate Selected'}
                </button>
                <button
                  onClick={() => handleBulkOperation('deactivate')}
                  className="px-4 py-2 bg-yellow-600 text-white hover:bg-yellow-700 text-sm"
                >
                  {(dict.admin as Record<string, unknown>)?.bulkDeactivate as string || 'Deactivate Selected'}
                </button>
                <button
                  onClick={() => setSelectedBundles(new Set())}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-50 bg-white text-sm"
                >
                  {(dict.common as Record<string, unknown>)?.cancel as string || 'Cancel'}
                </button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                    <input
                      type="checkbox"
                      checked={selectedBundles.size === bundles.length && bundles.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict?.admin as Record<string, unknown>)?.name as string || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.category as string || 'Category'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.price as string || 'Price'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.items as string || 'Items'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.admin as Record<string, unknown>)?.status as string || 'Status'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{(dict.common as Record<string, unknown>)?.actions as string || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bundles.map((bundle) => (
                  <tr key={bundle._id}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedBundles.has(bundle._id)}
                        onChange={() => handleSelectBundle(bundle._id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">{bundle.name}</div>
                      {bundle.description && (
                        <div className="text-xs text-gray-500 mt-1">{bundle.description.substring(0, 50)}...</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{bundle.sku || '-'}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {typeof bundle.categoryId === 'object' && bundle.categoryId?.name ? bundle.categoryId.name : '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Currency amount={bundle.price} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {bundle.items.length} {(dict.admin as Record<string, unknown>)?.item as string || 'item'}{bundle.items.length !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold border ${
                        bundle.isActive
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : 'bg-gray-100 text-gray-800 border-gray-300'
                      }`}>
                        {bundle.isActive ? ((dict?.admin as Record<string, unknown>)?.active as string || 'Active') : ((dict?.admin as Record<string, unknown>)?.inactive as string || 'Inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingBundle(bundle);
                            setShowBundleModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          {(dict?.common as Record<string, unknown>)?.edit as string || 'Edit'}
                        </button>
                        <button
                          onClick={() => handleToggleStatus(bundle)}
                          className={`${bundle.isActive ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          {bundle.isActive ? ((dict?.admin as Record<string, unknown>)?.deactivate as string || 'Deactivate') : ((dict?.admin as Record<string, unknown>)?.activate as string || 'Activate')}
                        </button>
                        <button
                          onClick={() => handleDeleteBundle(bundle._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {(dict.common as Record<string, unknown>)?.delete as string || 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bundles.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {searchTerm || filterActive !== null ? ((dict.common as Record<string, unknown>)?.noResults as string || 'No bundles found') : ((dict.common as Record<string, unknown>)?.noData as string || 'No bundles yet')}
              </div>
            )}
          </div>
        </div>

        {showBundleModal && bundlesAllowed && (
          <BundleModal
            bundle={editingBundle}
            products={products}
            productsLoading={productsLoading}
            categories={categories}
            onClose={() => {
              setShowBundleModal(false);
              setEditingBundle(null);
            }}
            onSave={() => {
              fetchBundles();
              setShowBundleModal(false);
              setEditingBundle(null);
            }}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

function BundleModal({
  bundle,
  products,
  productsLoading,
  categories,
  onClose,
  onSave,
  dict,
}: {
  bundle: Bundle | null;
  products: Product[];
  productsLoading: boolean;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
  dict: Record<string, unknown>;
}) {
  const [formData, setFormData] = useState({
    name: bundle?.name || '',
    description: bundle?.description || '',
    price: bundle?.price || 0,
    sku: bundle?.sku || '',
    categoryId: typeof bundle?.categoryId === 'object' && bundle.categoryId?._id ? bundle.categoryId._id : bundle?.categoryId || '',
    trackInventory: bundle?.trackInventory !== undefined ? bundle.trackInventory : true,
    items: bundle?.items || [] as BundleItem[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) {
      // Show all products when search is empty (limit to first 20 for performance)
      return products.slice(0, 20);
    }
    
    const searchLower = productSearch.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/);
    
    // Get products that match, with scoring for better sorting
    const scored = products
      .map(product => {
        const nameLower = (product.name || '').toLowerCase();
        const skuLower = (product.sku || '').toLowerCase();
        const descLower = (product.description || '').toLowerCase();
        
        let score = 0;
        let matches = false;
        
        // Check if all search terms match
        const allTermsMatch = searchTerms.every(term => 
          nameLower.includes(term) || 
          skuLower.includes(term) || 
          descLower.includes(term)
        );
        
        if (!allTermsMatch) return null;
        
        matches = true;
        
        // Exact match gets highest score
        if (nameLower === searchLower) score += 1000;
        else if (nameLower.startsWith(searchLower)) score += 50;
        else if (nameLower.includes(searchLower)) score += 10;
        
        // SKU exact match
        if (skuLower === searchLower) score += 500;
        else if (skuLower.includes(searchLower)) score += 20;
        
        // Description match
        if (descLower.includes(searchLower)) score += 5;
        
        return { product, score, matches };
      })
      .filter((item): item is { product: Product; score: number; matches: boolean } => item !== null)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
    
    return scored;
  }, [products, productSearch]);

  // Auto-select product if there's an exact match
  useEffect(() => {
    if (productSearch.trim()) {
      const exactMatch = products.find(
        p => p.name.toLowerCase() === productSearch.toLowerCase()
      );
      if (exactMatch) {
        setSelectedProduct(exactMatch);
      } else if (filteredProducts.length === 1) {
        // Auto-select if only one match
        setSelectedProduct(filteredProducts[0]);
      } else {
        setSelectedProduct(null);
      }
    } else {
      setSelectedProduct(null);
    }
    // Reset highlighted index when search changes
    setHighlightedIndex(-1);
  }, [productSearch, products, filteredProducts]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowProductSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAddItem = () => {
    // Use highlighted product, selected product, or try to find match
    let productToAdd = highlightedIndex >= 0 
      ? filteredProducts[highlightedIndex]
      : selectedProduct;
    
    if (!productToAdd && productSearch.trim()) {
      const exactMatch = products.find(
        p => p.name.toLowerCase() === productSearch.toLowerCase()
      );
      if (exactMatch) {
        productToAdd = exactMatch;
      } else if (filteredProducts.length === 1) {
        productToAdd = filteredProducts[0];
      }
    }
    
    if (!productToAdd) {
      return;
    }
    
    // Check if product is already in bundle
    const alreadyAdded = formData.items.some(
      item => (typeof item.productId === 'string' ? item.productId : item.productId._id) === productToAdd._id
    );
    
    if (alreadyAdded) {
      setError((dict?.admin as Record<string, unknown>)?.productAlreadyInBundle as string || 'This product is already in the bundle');
      setTimeout(() => setError(''), 3000);
      return;
    }
    
    const newItem: BundleItem = {
      productId: productToAdd._id,
      productName: productToAdd.name,
      quantity: itemQuantity,
    };
    
    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });
    setSelectedProduct(null);
    setProductSearch('');
    setItemQuantity(1);
    setShowProductSuggestions(false);
    setHighlightedIndex(-1);
    // Focus back on search input
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowProductSuggestions(true);
      setHighlightedIndex(prev => 
        prev < filteredProducts.length - 1 ? prev + 1 : prev
      );
      // Scroll into view
      if (highlightedIndex + 1 < filteredProducts.length) {
        suggestionItemsRef.current[highlightedIndex + 1]?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
      // Scroll into view
      if (highlightedIndex > 0) {
        suggestionItemsRef.current[highlightedIndex - 1]?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const productToSelect = highlightedIndex >= 0 
        ? filteredProducts[highlightedIndex]
        : filteredProducts.length > 0 
          ? filteredProducts[0]
          : selectedProduct;
      
      if (productToSelect) {
        // Check if product is already in bundle
        const alreadyAdded = formData.items.some(
          item => (typeof item.productId === 'string' ? item.productId : item.productId._id) === productToSelect._id
        );
        
        if (alreadyAdded) {
          setError((dict?.admin as Record<string, unknown>)?.productAlreadyInBundle as string || 'This product is already in the bundle');
          setTimeout(() => setError(''), 3000);
          return;
        }
        
        const newItem: BundleItem = {
          productId: productToSelect._id,
          productName: productToSelect.name,
          quantity: itemQuantity,
        };
        
        setFormData({
          ...formData,
          items: [...formData.items, newItem],
        });
        setSelectedProduct(null);
        setProductSearch('');
        setItemQuantity(1);
        setShowProductSuggestions(false);
        setHighlightedIndex(-1);
        // Focus back on search input
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    } else if (e.key === 'Escape') {
      setShowProductSuggestions(false);
      setHighlightedIndex(-1);
    }
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  // Helper function to highlight matching text
  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return text;
    
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === search.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 font-semibold">{part}</mark>
      ) : part
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    
    if (formData.items.length === 0) {
      setError((dict?.admin as Record<string, unknown>)?.bundleItemsRequired as string || 'At least one item is required');
      return;
    }

    setSaving(true);
    try {
      const url = bundle ? `/api/bundles/${bundle._id}` : '/api/bundles';
      const method = bundle ? 'PUT' : 'POST';
      const body = {
        name: formData.name,
        description: formData.description || undefined,
        price: formData.price,
        sku: formData.sku || undefined,
        categoryId: formData.categoryId || undefined,
        trackInventory: formData.trackInventory,
        items: formData.items.map(item => ({
          productId: typeof item.productId === 'object' ? item.productId._id : item.productId,
          productName: item.productName,
          quantity: item.quantity,
          variation: item.variation,
        })),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        onSave();
      } else {
        setError(data.error || (dict?.admin as Record<string, unknown>)?.saveBundleError as string || 'Failed to save bundle');
      }
    } catch {
      setError((dict?.admin as Record<string, unknown>)?.saveBundleError as string || 'Failed to save bundle');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-3xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {bundle ? ((dict?.admin as Record<string, unknown>)?.editBundle as string || 'Edit Bundle') : ((dict?.admin as Record<string, unknown>)?.addBundle as string || 'Add Bundle')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict?.admin as Record<string, unknown>)?.name as string || 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {(dict.admin as Record<string, unknown>)?.description as string || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.price as string || 'Price'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {(dict.admin as Record<string, unknown>)?.category as string || 'Category'}
                </label>
                <select
                  value={typeof formData.categoryId === 'string' ? formData.categoryId : formData.categoryId?._id || ''}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">{(dict.common as Record<string, unknown>)?.none as string || 'None'}</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bundle Items */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {(dict?.admin as Record<string, unknown>)?.bundleItems as string || 'Bundle Items'} *
              </label>
              
              {/* Add Item Section */}
              <div className="mb-4 p-4 border border-gray-300 bg-gray-50">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-2 relative z-10">
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setShowProductSuggestions(true);
                      }}
                      onFocus={() => {
                        if (!productsLoading) {
                          setShowProductSuggestions(true);
                        }
                      }}
                      onKeyDown={handleProductSearchKeyDown}
                      placeholder={(dict.admin as Record<string, unknown>)?.searchProduct as string || 'Search products...'}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                      autoComplete="off"
                    />
                    {showProductSuggestions && (
                      <div 
                        ref={suggestionsRef}
                        className="absolute z-[100] w-full mt-1 bg-white border border-gray-300 shadow-xl rounded-md max-h-60 overflow-y-auto"
                        style={{ top: '100%' }}
                      >
                        {productsLoading ? (
                          <div className="px-4 py-2 text-sm text-gray-500">
                            {(dict.admin as Record<string, unknown>)?.loadingProducts as string || 'Loading products...'}
                          </div>
                        ) : products.length === 0 ? (
                          <div className="px-4 py-2 text-sm text-gray-500">
                            {(dict?.admin as Record<string, unknown>)?.noProductsAvailable as string || 'No products available'}
                          </div>
                        ) : filteredProducts.length > 0 ? (
                          filteredProducts.map((product, index) => {
                            const isHighlighted = index === highlightedIndex;
                            const isAlreadyAdded = formData.items.some(
                              item => (typeof item.productId === 'string' ? item.productId : item.productId._id) === product._id
                            );
                            
                            return (
                              <button
                                key={product._id}
                                ref={el => { suggestionItemsRef.current[index] = el; }}
                                type="button"
                                onClick={() => {
                                  if (isAlreadyAdded) {
                                    setError((dict?.admin as Record<string, unknown>)?.productAlreadyInBundle as string || 'This product is already in the bundle');
                                    setTimeout(() => setError(''), 3000);
                                    return;
                                  }
                                  setSelectedProduct(product);
                                  setProductSearch(product.name);
                                  setShowProductSuggestions(false);
                                  setHighlightedIndex(-1);
                                }}
                                onMouseEnter={() => setHighlightedIndex(index)}
                                className={`w-full text-left px-4 py-2 focus:outline-none transition-colors border-b border-gray-100 last:border-b-0 ${
                                  isHighlighted 
                                    ? 'bg-blue-100 border-blue-300' 
                                    : 'hover:bg-blue-50'
                                } ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={isAlreadyAdded}
                              >
                                <div className="font-medium flex items-center justify-between">
                                  <span>{highlightMatch(product.name, productSearch)}</span>
                                  {isAlreadyAdded && (
                                    <span className="text-xs text-gray-400 ml-2">(Already added)</span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                                  <Currency amount={product.price} />
                                  {product.sku && (
                                    <span className="text-xs">SKU: {highlightMatch(product.sku, productSearch)}</span>
                                  )}
                                  {product.stock !== undefined && (
                                    <span className={`ml-2 ${product.stock === 0 ? 'text-red-500' : ''}`}>
                                      • Stock: {product.stock}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-2 text-sm text-gray-500">
                            {(dict.admin as Record<string, unknown>)?.noProductsFound as string || 'No products found'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                      placeholder={(dict.admin as Record<string, unknown>)?.quantity as string || 'Qty'}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={
                      !selectedProduct && 
                      highlightedIndex < 0 && 
                      filteredProducts.length !== 1 &&
                      !productSearch.trim()
                    }
                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-700 transition-colors"
                  >
                    {(dict.common as Record<string, unknown>)?.add as string || 'Add'}
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-gray-300 bg-white">
                    <div className="flex-1">
                      <span className="font-medium">{item.productName}</span>
                      <span className="ml-2 text-sm text-gray-500">x {item.quantity}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-600 hover:text-red-900 ml-4"
                    >
                      {(dict.common as Record<string, unknown>)?.remove as string || 'Remove'}
                    </button>
                  </div>
                ))}
                {formData.items.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    {(dict.admin as Record<string, unknown>)?.noItems as string || 'No items added. Add products to create a bundle.'}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.trackInventory}
                  onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">
                  {(dict.admin as Record<string, unknown>)?.trackInventory as string || 'Track Inventory'}
                </span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              >
                {(dict.common as Record<string, unknown>)?.cancel as string || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 border border-blue-700"
              >
                {saving ? ((dict.common as Record<string, unknown>)?.loading as string || 'Saving...') : ((dict.common as Record<string, unknown>)?.save as string || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
