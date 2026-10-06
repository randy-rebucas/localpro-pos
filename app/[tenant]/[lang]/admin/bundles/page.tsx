'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import dynamic from 'next/dynamic';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useBundlesList, type Bundle, type BundleItem, type BundleFilters } from '@/hooks/useBundlesList';
import { useBundleForm } from '@/hooks/useBundleForm';
import { useBundlesAnalytics } from '@/hooks/useBundlesAnalytics';
import { getBulkActionConfirmMessage } from '@/lib/bundles-helpers';

const SPINNER = <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>;
const SPINNER_SM = <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>;

// Dynamically import charts to avoid SSR issues
const BundlePerformanceCharts = dynamic(() => import('@/components/BundlePerformanceCharts'), {
  ssr: false,
  loading: () => <div className="w-full h-64 flex items-center justify-center">{SPINNER}</div>,
});

const btnPrimary =
  'px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors';
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors';
const btnDropdownItem =
  'block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50';
const btnRowIcon =
  'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const thCls = 'px-4 py-3 text-left font-medium';
const thRight = 'px-4 py-3 text-right font-medium';

const ICON = {
  edit: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  delete: 'M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.7 12.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9L7 7h10Z',
  activate: 'm5 12 5 5L20 7',
  deactivate: 'M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10',
  close: 'M6 18 18 6M6 6l12 12',
  search: 'm21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  upload: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
};

function Icon({ d, className = 'w-4 h-4' }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

interface Product {
  _id: string;
  name: string;
  price: number;
  stock: number;
  hasVariations: boolean;
  variations?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  sku?: string;
  description?: string;
}

interface Category {
  id: string;
  name: string;
}

export default function BundlesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [bundleFormKey, setBundleFormKey] = useState(0);
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
  const [analyticsStartDate, setAnalyticsStartDate] = useState('');
  const [analyticsEndDate, setAnalyticsEndDate] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const filtersMounted = useRef(false);

  const { settings } = useTenantSettings();
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const bundlesAllowed = businessTypeConfig?.productTypes?.includes('bundle') ?? true;
  const { canAccess } = usePermissions();
  // Page access: any bundle action. Each control below checks its own action.
  const canManage = canAccess('bundles.manage');
  const canCreate = canAccess('bundles.create');
  const canEdit = canAccess('bundles.edit');
  const canDelete = canAccess('bundles.delete');
  const canViewAnalytics = canAccess('bundles.analytics');

  const { bundles, loading, error, fetchBundles, deleteBundle, toggleBundleStatus, bulkToggleStatus } = useBundlesList();
  const { analytics, loading: analyticsLoading, fetchAnalytics: fetchAnalyticsData } = useBundlesAnalytics();

  const currentFilters = (): BundleFilters => ({
    search: searchTerm,
    isActive: filterActive,
    categoryId: filterCategory,
    minPrice: filterMinPrice,
    maxPrice: filterMaxPrice,
    startDate: filterStartDate,
    endDate: filterEndDate,
  });
  const reload = () => fetchBundles(currentFilters());

  const advancedFilterCount = [filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate].filter(Boolean).length;
  const hasFilters = !!searchTerm || filterActive !== null || advancedFilterCount > 0;

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    fetchBundles(currentFilters());
    fetchProducts();
    fetchCategories();
    // Set default analytics date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setAnalyticsEndDate(end.toISOString().split('T')[0]);
    setAnalyticsStartDate(start.toISOString().split('T')[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch on any filter change (including clearing them), debounced for typing.
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    const timer = setTimeout(() => fetchBundles(currentFilters()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterActive, filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate]);

  useEffect(() => {
    setSelectedBundles(new Set());
  }, [searchTerm, filterActive, filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (showAnalytics && analyticsStartDate && analyticsEndDate) {
      fetchAnalyticsData(analyticsStartDate, analyticsEndDate, (error) => toast.error(error));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnalytics, analyticsStartDate, analyticsEndDate]);

  const fetchProducts = async () => {
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
  };

  const fetchCategories = async () => {
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
  };

  const openBundleForm = (bundle: Bundle | null) => {
    setEditingBundle(bundle);
    setBundleFormKey((k) => k + 1);
    setShowBundleForm(true);
  };

  const handleDeleteBundle = async (bundle: Bundle) => {
    if (!dict) return;
    const message = (dict.admin?.deleteBundleNamed || 'Delete bundle "{name}"?').replace('{name}', bundle.name);
    if (!confirm(message)) return;

    setBusyId(bundle._id);
    await deleteBundle(
      bundle._id,
      async (message) => {
        toast.success(message);
        await reload();
      },
      (error) => toast.error(error)
    );
    setBusyId(null);
  };

  const handleToggleStatus = async (bundle: Bundle) => {
    if (!dict) return;
    if (bundle.isActive) {
      const message = (dict.admin?.deactivateBundleNamed || 'Deactivate bundle "{name}"? It will no longer be sold.').replace('{name}', bundle.name);
      if (!confirm(message)) return;
    }

    setBusyId(bundle._id);
    await toggleBundleStatus(
      bundle._id,
      bundle.isActive,
      (message) => {
        toast.success(message);
        reload();
      },
      (error) => toast.error(error)
    );
    setBusyId(null);
  };

  const handleBulkOperation = async (action: 'activate' | 'deactivate') => {
    if (selectedBundles.size === 0) {
      toast.error(dict?.common?.selectAtLeastOneBundle || 'Please select at least one bundle');
      return;
    }

    if (!dict) return;
    if (!confirm(getBulkActionConfirmMessage(action, selectedBundles.size, dict))) {
      return;
    }

    setBulkBusy(true);
    await bulkToggleStatus(
      Array.from(selectedBundles),
      action,
      async (message) => {
        toast.success(message);
        setSelectedBundles(new Set());
        await reload();
      },
      (error) => toast.error(error)
    );
    setBulkBusy(false);
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

  const handleExport = async (format: 'csv' | 'excel' | 'pdf' = 'csv') => {
    if (!dict || exporting) return;

    const hName = dict.admin?.name || 'Name';
    const hSku = dict.admin?.sku || 'SKU';
    const hCategory = dict.admin?.category || 'Category';
    const hPrice = dict.admin?.price || 'Price';
    const hItemsCount = dict.admin?.itemsCount || 'Items Count';
    const hStatus = dict.admin?.status || 'Status';
    const hDescription = dict.admin?.description || 'Description';
    const hCreatedAt = dict.admin?.createdAt || 'Created At';

    const headers = [hName, hSku, hCategory, hPrice, hItemsCount, hStatus, hDescription, hCreatedAt];

    const exportData = bundles.map(bundle => ({
      [hName]: bundle.name,
      [hSku]: bundle.sku || '',
      [hCategory]: typeof bundle.categoryId === 'object' && bundle.categoryId?.name ? bundle.categoryId.name : '',
      [hPrice]: bundle.price,
      [hItemsCount]: bundle.items.length,
      [hStatus]: bundle.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive'),
      [hDescription]: bundle.description || '',
      [hCreatedAt]: new Date(bundle.createdAt).toLocaleString(undefined, { hour12: true }),
    }));

    const baseFilename = `bundles_export_${new Date().toISOString().split('T')[0]}`;

    setExporting(true);
    try {
      const { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
      if (format === 'csv') {
        const csv = arrayToCSV(exportData, headers);
        downloadCSV(csv, `${baseFilename}.csv`);
      } else if (format === 'excel') {
        await downloadExcel(exportData, headers, baseFilename);
      } else if (format === 'pdf') {
        await downloadPDF(exportData, headers, baseFilename, dict.admin?.bundles || 'Bundles');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
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

  const handleLoadAnalytics = () => {
    if (analyticsStartDate && analyticsEndDate) {
      fetchAnalyticsData(analyticsStartDate, analyticsEndDate, (error) => toast.error(error));
    }
  };

  if (!dict) {
    return <div className="flex items-center justify-center py-24">{SPINNER}</div>;
  }

  const header = (
    <AdminPageHeader
      title={dict.admin?.bundles || 'Product Bundles'}
      description={dict.admin?.bundlesDescription || 'Manage product bundles and packages'}
    />
  );

  if (!canManage) {
    return (
      <div className="px-4 sm:px-6 py-6">
        {header}
        <div className="p-4 bg-white border border-win8-danger text-sm" role="alert">
          <p className="font-bold text-win8-danger">{dict.admin?.accessRestricted || 'Access Restricted'}</p>
          <p className="text-gray-700 mt-1">
            {dict.admin?.accessRestrictedBundles || "You don't have permission to manage bundles. Contact an admin or owner."}
          </p>
        </div>
      </div>
    );
  }

  const renderList = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          {SPINNER}
          <p className="mt-3 text-gray-400 text-sm">{dict.admin?.loadingBundles || 'Loading bundles…'}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{error}</p>
          <button onClick={reload} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (bundles.length === 0) {
      return (
        <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">
          {hasFilters
            ? (dict.admin?.noBundlesMatch || 'No bundles match your filters.')
            : (dict.admin?.noBundlesYet || 'No bundles yet.')}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
            <tr>
              <th className={`${thCls} w-10`}>
                <input
                  type="checkbox"
                  checked={selectedBundles.size === bundles.length && bundles.length > 0}
                  onChange={handleSelectAll}
                  className="checkbox-win8"
                  aria-label={dict.common?.selectAll || 'Select all'}
                />
              </th>
              <th className={thCls}>{dict.admin?.name || 'Name'}</th>
              <th className={thCls}>{dict.admin?.sku || 'SKU'}</th>
              <th className={thCls}>{dict.admin?.category || 'Category'}</th>
              <th className={thRight}>{dict.admin?.price || 'Price'}</th>
              <th className={thRight}>{dict.admin?.items || 'Items'}</th>
              <th className={thCls}>{dict.admin?.status || 'Status'}</th>
              <th className={thRight}>{dict.common?.actions || 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bundles.map((bundle) => {
              const selected = selectedBundles.has(bundle._id);
              const busy = busyId === bundle._id;
              const toggleLabel = bundle.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate');
              return (
                <tr key={bundle._id} className={`hover:bg-gray-100 transition-colors ${selected ? 'bg-brand-soft' : ''}`}>
                  <td className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => handleSelectBundle(bundle._id)}
                      className="checkbox-win8"
                      aria-label={`${dict.common?.select || 'Select'} ${bundle.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{bundle.name}</p>
                    {bundle.description && (
                      <p className="text-xs text-gray-500 mt-0.5 max-w-[240px] truncate" title={bundle.description}>{bundle.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-700">{bundle.sku || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                    {typeof bundle.categoryId === 'object' && bundle.categoryId?.name ? bundle.categoryId.name : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">
                    <Currency amount={bundle.price} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">
                    {bundle.items.length} {bundle.items.length !== 1 ? (dict.admin?.items || 'items') : (dict.admin?.item || 'item')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-semibold ${bundle.isActive ? 'bg-win8-success text-white' : 'bg-gray-500 text-white'}`}>
                      {bundle.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {bundlesAllowed && canEdit && (
                        <button
                          type="button"
                          onClick={() => openBundleForm(bundle)}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={`${dict.common?.edit || 'Edit'} ${bundle.name}`}
                          className={`${btnRowIcon} bg-brand`}
                        >
                          <Icon d={ICON.edit} />
                        </button>
                      )}
                      {canEdit && (<button
                        type="button"
                        onClick={() => handleToggleStatus(bundle)}
                        disabled={busy}
                        title={toggleLabel}
                        aria-label={`${toggleLabel} ${bundle.name}`}
                        className={`${btnRowIcon} ${bundle.isActive ? 'bg-win8-danger' : 'bg-win8-success'}`}
                      >
                        {busy ? SPINNER_SM : <Icon d={bundle.isActive ? ICON.deactivate : ICON.activate} />}
                      </button>)}
                      {canDelete && (<button
                        type="button"
                        onClick={() => handleDeleteBundle(bundle)}
                        disabled={busy}
                        title={dict.common?.delete || 'Delete'}
                        aria-label={`${dict.common?.delete || 'Delete'} ${bundle.name}`}
                        className={`${btnRowIcon} bg-win8-danger`}
                      >
                        <Icon d={ICON.delete} />
                      </button>)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="px-4 sm:px-6 py-6">
        {header}

        <div className="space-y-4">
          {!bundlesAllowed && (
            <div className="p-4 bg-white border border-win8-warning text-sm" role="status">
              <p className="font-bold text-win8-warning">{dict.admin?.bundlesNotAvailable || 'Bundles Not Available'}</p>
              <p className="text-gray-700 mt-1">
                {(dict.admin?.bundlesNotAvailableDesc || 'Product bundles are not available for {businessType}. This feature is typically used for retail and restaurant businesses.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
              </p>
              <p className="text-gray-500 mt-1">
                {dict.admin?.bundlesNotAvailableHint || 'If you need bundles, please update your business type in Settings.'}
              </p>
            </div>
          )}

          {/* Bundle Analytics */}
          {canViewAnalytics && (<section className="bg-white border border-gray-300">
            <div className={`px-6 py-4 flex items-center justify-between gap-3 ${showAnalytics ? 'border-b border-gray-300' : ''}`}>
              <h2 className="text-base font-bold text-gray-900">{dict.admin?.bundleAnalytics || 'Bundle Analytics'}</h2>
              <button
                type="button"
                onClick={() => setShowAnalytics(!showAnalytics)}
                aria-expanded={showAnalytics}
                className={btnSecondary}
              >
                {showAnalytics ? (dict.common?.hide || 'Hide') : (dict.admin?.viewAnalytics || 'View Analytics')}
              </button>
            </div>
            {showAnalytics && (
              <div className="p-6 space-y-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label htmlFor="analytics-start" className={labelCls}>{dict.reports?.startDate || 'Start Date'}</label>
                    <input
                      id="analytics-start"
                      type="date"
                      value={analyticsStartDate}
                      max={analyticsEndDate || undefined}
                      onChange={(e) => setAnalyticsStartDate(e.target.value)}
                      className="border border-gray-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="analytics-end" className={labelCls}>{dict.reports?.endDate || 'End Date'}</label>
                    <input
                      id="analytics-end"
                      type="date"
                      value={analyticsEndDate}
                      min={analyticsStartDate || undefined}
                      onChange={(e) => setAnalyticsEndDate(e.target.value)}
                      className="border border-gray-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <button type="button" onClick={handleLoadAnalytics} disabled={analyticsLoading} className={btnPrimary}>
                    {analyticsLoading ? (dict.common?.loading || 'Loading…') : (dict.admin?.loadAnalytics || 'Load Analytics')}
                  </button>
                </div>

                {analyticsLoading ? (
                  <div className="text-center py-12">
                    {SPINNER}
                    <p className="mt-3 text-gray-400 text-sm">{dict.common?.loading || 'Loading…'}</p>
                  </div>
                ) : analytics && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: dict.admin?.totalBundles || 'Total Bundles', color: 'bg-brand', value: analytics.summary.totalBundles.toLocaleString() },
                        { label: dict.admin?.totalSales || 'Total Sales', color: 'bg-win8-success', value: <Currency amount={analytics.summary.totalSales} /> },
                        { label: dict.admin?.totalQuantity || 'Total Quantity', color: 'bg-win8-accent', value: analytics.summary.totalQuantity.toLocaleString() },
                        { label: dict.admin?.totalTransactions || 'Transactions', color: 'bg-brand-navy', value: analytics.summary.totalTransactions.toLocaleString() },
                      ].map((tile) => (
                        <div key={tile.label} className={`${tile.color} text-white p-5`}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-white/80 leading-tight">{tile.label}</p>
                          <div className="text-3xl font-bold tabular-nums mt-2">{tile.value}</div>
                        </div>
                      ))}
                    </div>

                    {analytics.analytics && analytics.analytics.length > 0 ? (
                      <>
                        <BundlePerformanceCharts
                          analytics={analytics.analytics.map((item: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
                            bundleId: item.bundleId,
                            bundleName: item.bundleName,
                            bundlePrice: item.bundlePrice,
                            totalSales: item.totalSales,
                            totalQuantity: item.totalQuantity,
                            transactionCount: item.transactionCount,
                            averageOrderValue: item.averageOrderValue,
                            averageQuantity: item.averageQuantity,
                            revenuePerUnit: item.revenuePerUnit,
                          }))}
                          dict={dict}
                        />
                        <div className="overflow-x-auto border border-gray-300 bg-white max-h-[70vh] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
                              <tr>
                                <th className={thCls}>{dict.admin?.bundle || 'Bundle'}</th>
                                <th className={thRight}>{dict.admin?.price || 'Price'}</th>
                                <th className={thRight}>{dict.admin?.totalSales || 'Total Sales'}</th>
                                <th className={thRight}>{dict.admin?.quantity || 'Quantity'}</th>
                                <th className={thRight}>{dict.admin?.transactions || 'Transactions'}</th>
                                <th className={thRight}>{dict.admin?.avgOrderValue || 'Avg Order Value'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {analytics.analytics.map((item: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                                <tr key={item.bundleId} className="hover:bg-gray-100 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">{item.bundleName}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700"><Currency amount={item.bundlePrice} /></td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900"><Currency amount={item.totalSales} /></td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">{Number(item.totalQuantity).toLocaleString()}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700">{Number(item.transactionCount).toLocaleString()}</td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-gray-700"><Currency amount={item.averageOrderValue} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 italic">{dict.admin?.noAnalyticsData || 'No sales data for selected period'}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>)}

          {/* Toolbar */}
          <div className="bg-white border border-gray-300">
            <div className="flex items-center justify-between gap-3 flex-wrap p-3">
              <div className="flex gap-3 flex-wrap">
                <div className="relative">
                  <Icon d={ICON.search} className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={dict.common?.search || 'Search bundles…'}
                    aria-label={dict.common?.search || 'Search bundles'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
                  />
                </div>
                <select
                  value={filterActive === null ? 'all' : filterActive.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFilterActive(value === 'all' ? null : value === 'true');
                  }}
                  aria-label={dict.admin?.status || 'Status'}
                  className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
                >
                  <option value="all">{dict.common?.all || 'All'}</option>
                  <option value="true">{dict.admin?.active || 'Active'}</option>
                  <option value="false">{dict.admin?.inactive || 'Inactive'}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  aria-expanded={showAdvancedFilters}
                  className={`${btnSecondary} ${showAdvancedFilters ? 'bg-gray-100' : ''}`}
                >
                  {dict.admin?.advancedFilters || 'Advanced Filters'}
                  {advancedFilterCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-brand text-white tabular-nums">{advancedFilterCount}</span>
                  )}
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="relative group">
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                    aria-haspopup="menu"
                    className={btnSecondary}
                  >
                    {exporting ? (dict.admin?.exporting || 'Exporting…') : `${dict.admin?.export || 'Export'} ▼`}
                  </button>
                  <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 hidden group-hover:block group-focus-within:block z-20" role="menu">
                    <button type="button" role="menuitem" onClick={() => handleExport('csv')} disabled={exporting} className={btnDropdownItem}>
                      {dict.admin?.exportCSV || 'Export CSV'}
                    </button>
                    <button type="button" role="menuitem" onClick={() => handleExport('excel')} disabled={exporting} className={btnDropdownItem}>
                      {dict.admin?.exportExcel || 'Export Excel'}
                    </button>
                    <button type="button" role="menuitem" onClick={() => handleExport('pdf')} disabled={exporting} className={btnDropdownItem}>
                      {dict.admin?.exportPDF || 'Export PDF'}
                    </button>
                  </div>
                </div>
                {bundlesAllowed && (canCreate || canEdit) && (
                  <>
                    <Link href={`/${tenant}/${lang}/admin/file-upload`} className={`${btnSecondary} inline-flex items-center gap-2`}>
                      <Icon d={ICON.upload} />
                      {dict.admin?.uploadImages || 'Upload Images'}
                    </Link>
                    {canCreate && (<button type="button" onClick={() => openBundleForm(null)} className={btnPrimary}>
                      + {dict.admin?.addBundle || 'Add Bundle'}
                    </button>)}
                  </>
                )}
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="border-t border-gray-300 p-4 flex flex-wrap gap-3 items-end">
                <div>
                  <label htmlFor="bf-category" className={labelCls}>{dict.admin?.category || 'Category'}</label>
                  <select
                    id="bf-category"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-3 py-2 border border-gray-300 text-sm bg-white w-44"
                  >
                    <option value="">{dict.common?.all || 'All'}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bf-min" className={labelCls}>{dict.admin?.minPrice || 'Min Price'}</label>
                  <input
                    id="bf-min"
                    type="number"
                    step="0.01"
                    min="0"
                    value={filterMinPrice}
                    onChange={(e) => setFilterMinPrice(e.target.value)}
                    className="px-3 py-2 border border-gray-300 text-sm bg-white w-32 tabular-nums"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label htmlFor="bf-max" className={labelCls}>{dict.admin?.maxPrice || 'Max Price'}</label>
                  <input
                    id="bf-max"
                    type="number"
                    step="0.01"
                    min="0"
                    value={filterMaxPrice}
                    onChange={(e) => setFilterMaxPrice(e.target.value)}
                    className="px-3 py-2 border border-gray-300 text-sm bg-white w-32 tabular-nums"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label htmlFor="bf-start" className={labelCls}>{dict.reports?.startDate || 'Start Date'}</label>
                  <input
                    id="bf-start"
                    type="date"
                    value={filterStartDate}
                    max={filterEndDate || undefined}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 text-sm bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="bf-end" className={labelCls}>{dict.reports?.endDate || 'End Date'}</label>
                  <input
                    id="bf-end"
                    type="date"
                    value={filterEndDate}
                    min={filterStartDate || undefined}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 text-sm bg-white"
                  />
                </div>
                {hasFilters && (
                  <button type="button" onClick={clearFilters} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
                    {dict.admin?.clearFilters || dict.common?.clear || 'Clear'}
                  </button>
                )}
              </div>
            )}
          </div>

          {canEdit && selectedBundles.size > 0 && (
            <div className="p-3 bg-brand-soft border border-brand flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-semibold text-brand-navy tabular-nums">
                {selectedBundles.size} {dict.admin?.selected || 'selected'}
              </span>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleBulkOperation('activate')}
                  disabled={bulkBusy}
                  className="px-4 py-2 bg-win8-success text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
                >
                  {dict.admin?.bulkActivate || 'Activate Selected'}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkOperation('deactivate')}
                  disabled={bulkBusy}
                  className="px-4 py-2 bg-win8-danger text-white text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-[filter]"
                >
                  {dict.admin?.bulkDeactivate || 'Deactivate Selected'}
                </button>
                <button type="button" onClick={() => setSelectedBundles(new Set())} className={btnSecondary}>
                  {dict.common?.cancel || 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {renderList()}
        </div>
      </div>

      {bundlesAllowed && (
        <Win8Drawer open={showBundleForm} onClose={() => setShowBundleForm(false)} widthClass="max-w-2xl">
          <BundleForm
            key={bundleFormKey}
            bundle={editingBundle}
            products={products}
            productsLoading={productsLoading}
            categories={categories}
            onClose={() => setShowBundleForm(false)}
            onSave={() => {
              setShowBundleForm(false);
              reload();
            }}
            dict={dict}
          />
        </Win8Drawer>
      )}
    </>
  );
}

function BundleForm({
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
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, setFormData, error, submitting, handleSubmit: submitForm } = useBundleForm(bundle, dict);
  const [productSearch, setProductSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [localError, setLocalError] = useState(''); // Local error for product validation
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const flashLocalError = () => {
    setLocalError(dict?.admin?.productAlreadyInBundle || 'This product is already in the bundle');
    setTimeout(() => setLocalError(''), 3000);
  };

  const isInBundle = (productId: string) =>
    formData.items.some(item => (typeof item.productId === 'string' ? item.productId : item.productId._id) === productId);

  const addProduct = (product: Product) => {
    if (isInBundle(product._id)) {
      flashLocalError();
      return;
    }

    const newItem: BundleItem = {
      productId: product._id,
      productName: product.name,
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

    addProduct(productToAdd);
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
        addProduct(productToSelect);
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
        <mark key={i} className="bg-brand-soft text-brand-navy font-semibold">{part}</mark>
      ) : part
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Save errors are shown inline via `error` from useBundleForm.
    await submitForm(async () => {
      toast.success(dict?.admin?.bundleSavedSuccessfully || 'Bundle saved successfully');
      onSave();
    });
  };

  const closeLabel = dict.common?.close || 'Close';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
        <h2 className="text-base font-semibold">
          {bundle ? (dict.admin?.editBundle || 'Edit Bundle') : (dict.admin?.addBundle || 'Add Bundle')}
        </h2>
        <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
          <Icon d={ICON.close} className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bundle-name" className={labelCls}>
                {dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="bundle-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="bundle-sku" className={labelCls}>{dict.admin?.sku || 'SKU'}</label>
              <input
                id="bundle-sku"
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="bundle-description" className={labelCls}>{dict.admin?.description || 'Description'}</label>
            <textarea
              id="bundle-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bundle-price" className={labelCls}>
                {dict.admin?.price || 'Price'} <span className="text-win8-danger">*</span>
              </label>
              <input
                id="bundle-price"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className={`${inputCls} tabular-nums`}
              />
            </div>
            <div>
              <label htmlFor="bundle-category" className={labelCls}>{dict.admin?.category || 'Category'}</label>
              <select
                id="bundle-category"
                value={formData.categoryId || ''}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className={inputCls}
              >
                <option value="">{dict.common?.none || 'None'}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <hr className="border-gray-300" />

          {/* Bundle Items */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {dict.admin?.bundleItems || 'Bundle Items'} <span className="text-win8-danger">*</span>
            </p>

            <div className="p-3 border border-gray-300 bg-gray-50">
              <div className="flex gap-2">
                <div className="flex-1 relative">
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
                    placeholder={dict.admin?.searchProduct || 'Search products…'}
                    aria-label={dict.admin?.searchProduct || 'Search products'}
                    className={inputCls}
                    autoComplete="off"
                  />
                  {showProductSuggestions && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-30 w-full mt-1 bg-white border border-gray-300 max-h-60 overflow-y-auto"
                      style={{ top: '100%' }}
                    >
                      {productsLoading ? (
                        <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                          <span className="text-brand">{SPINNER_SM}</span>
                          {dict.admin?.loadingProducts || 'Loading products…'}
                        </div>
                      ) : products.length === 0 ? (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          {dict.admin?.noProductsAvailable || 'No products available'}
                        </div>
                      ) : filteredProducts.length > 0 ? (
                        filteredProducts.map((product, index) => {
                          const isHighlighted = index === highlightedIndex;
                          const isAlreadyAdded = isInBundle(product._id);

                          return (
                            <button
                              key={product._id}
                              ref={el => { suggestionItemsRef.current[index] = el; }}
                              type="button"
                              onClick={() => {
                                if (isAlreadyAdded) {
                                  flashLocalError();
                                  return;
                                }
                                setSelectedProduct(product);
                                setProductSearch(product.name);
                                setShowProductSuggestions(false);
                                setHighlightedIndex(-1);
                              }}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`w-full text-left px-4 py-2 transition-colors border-b border-gray-200 last:border-b-0 ${
                                isHighlighted ? 'bg-gray-100' : 'hover:bg-gray-100'
                              } ${isAlreadyAdded ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={isAlreadyAdded}
                            >
                              <div className="text-sm font-medium text-gray-900 flex items-center justify-between">
                                <span>{highlightMatch(product.name, productSearch)}</span>
                                {isAlreadyAdded && (
                                  <span className="text-xs text-gray-400 ml-2">{dict?.admin?.alreadyAdded || 'Already added'}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5 tabular-nums">
                                <Currency amount={product.price} />
                                {product.sku && (
                                  <span className="font-mono">{highlightMatch(product.sku, productSearch)}</span>
                                )}
                                {product.stock !== undefined && (
                                  <span className={product.stock === 0 ? 'font-semibold text-win8-danger' : ''}>
                                    · {dict?.admin?.stock || 'Stock'}: {product.stock.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          {dict.admin?.noProductsFound || 'No products found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                  placeholder={dict.admin?.quantity || 'Qty'}
                  aria-label={dict.admin?.quantity || 'Quantity'}
                  className="w-20 border border-gray-300 px-3 py-2 text-sm bg-white text-right tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={
                    !selectedProduct &&
                    highlightedIndex < 0 &&
                    filteredProducts.length !== 1 &&
                    !productSearch.trim()
                  }
                  className={btnPrimary}
                >
                  {dict.common?.add || 'Add'}
                </button>
              </div>
              {localError && (
                <p className="mt-2 text-xs font-medium text-win8-danger" role="alert">{localError}</p>
              )}
            </div>

            {formData.items.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                {dict.admin?.noItems || 'No items added. Add products to create a bundle.'}
              </p>
            ) : (
              <div className="border border-gray-300 divide-y divide-gray-200">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between gap-3 px-3 py-2 bg-white">
                    <p className="text-sm font-medium text-gray-900 min-w-0 truncate">{item.productName}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-gray-500 tabular-nums">× {item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        title={dict.common?.remove || 'Remove'}
                        aria-label={`${dict.common?.remove || 'Remove'} ${item.productName}`}
                        className="inline-flex items-center justify-center p-2 text-win8-danger hover:bg-gray-100 transition-colors"
                      >
                        <Icon d={ICON.close} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.trackInventory}
              onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })}
              className="checkbox-win8"
            />
            {dict.admin?.trackInventory || 'Track Inventory'}
          </label>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={submitting} className={btnPrimary}>
            {submitting ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}
