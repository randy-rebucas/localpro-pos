'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { BarChart3, ChevronDown, Download, ImageUp, Layers, Pencil, Plus, Power, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import {
  ICON, DARK_LABEL, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, LABEL, INPUT, INPUT_BASE, CHECKBOX, CHECK_ROW, HINT,
  KEY, KEY_PRIMARY, ROW_KEY, RegisterPage, LedReadout, Sheet, Strip,
} from '@/components/admin/register-ui';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirm } from '@/lib/confirm';
import { getTenantDateString } from '@/lib/timezone';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
import { useBundlesList, type Bundle, type BundleFilters, type BundleItem } from '@/hooks/useBundlesList';
import { useBundleForm } from '@/hooks/useBundleForm';
import { useBundlesAnalytics } from '@/hooks/useBundlesAnalytics';
import { getDeleteConfirmMessage } from '@/lib/bundles-helpers';
import { getDefaultTenantSettings } from '@/lib/currency';
import { formatDateTime } from '@/lib/formatting';

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
  _id: string;
  name: string;
}

type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const TH = 'whitespace-nowrap px-4 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'whitespace-nowrap px-4 py-2.5 font-receipt text-sm';

const itemId = (item: BundleItem) => (typeof item.productId === 'string' ? item.productId : item.productId._id);
const categoryName = (bundle: Bundle) =>
  typeof bundle.categoryId === 'object' && bundle.categoryId?.name ? bundle.categoryId.name : '';

/** A figure on the till's customer display. Doto has no peso glyph, so money stays in the receipt face. */
function Readout({ label, led = false, children }: { label: string; led?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border border-white/10 bg-black/30 p-4">
      <p className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{label}</p>
      <p className={`mk-led-glow mt-2 break-words text-[#7df0d6] ${led ? 'font-led text-4xl leading-none' : 'font-receipt text-2xl font-semibold leading-tight'}`}>
        {children}
      </p>
    </div>
  );
}

export default function BundlesPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<Dict | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editingBundle, setEditingBundle] = useState<Bundle | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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
  const [loadedOnce, setLoadedOnce] = useState(false);

  const { settings } = useTenantSettings();
  const timezone = settings?.timezone;
  const businessTypeConfig = settings ? getBusinessTypeConfig(getBusinessType(settings)) : null;
  const bundlesAllowed = businessTypeConfig?.productTypes?.includes('bundle') ?? true;
  const { canAccess } = usePermissions();
  const canManage = canAccess('bundles.manage');
  const { confirm, Dialog: confirmDialog } = useConfirm();

  const { bundles, loading, fetchBundles, deleteBundle, toggleBundleStatus, bulkToggleStatus } = useBundlesList();
  const { analytics, loading: analyticsLoading, fetchAnalytics: fetchAnalyticsData } = useBundlesAnalytics();

  const filters: BundleFilters = useMemo(() => ({
    search: debouncedSearch,
    isActive: filterActive,
    categoryId: filterCategory,
    minPrice: filterMinPrice,
    maxPrice: filterMaxPrice,
    startDate: filterStartDate,
    endDate: filterEndDate,
  }), [debouncedSearch, filterActive, filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate]);

  const refetch = useCallback(() => fetchBundles(filters), [fetchBundles, filters]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Any change to the filters, including clearing them, reloads the list
  useEffect(() => {
    fetchBundles(filters).finally(() => setLoadedOnce(true));
  }, [fetchBundles, filters]);

  useEffect(() => {
    setSelectedBundles(new Set());
  }, [filters]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  // Default the sales view to the store's last 30 days
  useEffect(() => {
    setAnalyticsEndDate(getTenantDateString(timezone));
    setAnalyticsStartDate(getTenantDateString(timezone, 30));
  }, [timezone]);

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

  const handleDeleteBundle = async (bundle: Bundle) => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.admin?.deleteBundleTitle || 'Delete bundle?',
      `${getDeleteConfirmMessage(dict)} (${bundle.name})`,
      { variant: 'danger', confirmText: dict.common?.delete || 'Delete', cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

    await deleteBundle(
      bundle._id,
      async (message) => {
        toast.success(message);
        await refetch();
      },
      (error) => toast.error(error)
    );
  };

  const handleToggleStatus = async (bundle: Bundle) => {
    if (!dict) return;
    const actionLabel = bundle.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate');
    const confirmed = await confirm(
      bundle.isActive
        ? (dict.admin?.deactivateBundleConfirm || 'Deactivate this bundle?')
        : (dict.admin?.activateBundleConfirm || 'Activate this bundle?'),
      bundle.name,
      { variant: bundle.isActive ? 'warning' : 'info', confirmText: actionLabel, cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

    await toggleBundleStatus(
      bundle._id,
      bundle.isActive,
      (message) => {
        toast.success(message);
        refetch();
      },
      (error) => toast.error(error)
    );
  };

  const handleBulkOperation = async (action: 'activate' | 'deactivate') => {
    if (!dict) return;
    if (selectedBundles.size === 0) {
      toast.error(dict.common?.selectAtLeastOneBundle || 'Please select at least one bundle');
      return;
    }

    const actionLabel = action === 'activate' ? (dict.admin?.activate || 'Activate') : (dict.admin?.deactivate || 'Deactivate');
    const message = (dict.common?.bulkActionBundleConfirm || 'Are you sure you want to {action} {count} bundle(s)?')
      .replace('{action}', actionLabel.toLowerCase())
      .replace('{count}', String(selectedBundles.size));
    const confirmed = await confirm(
      action === 'activate' ? (dict.admin?.bulkActivate || 'Activate Selected') : (dict.admin?.bulkDeactivate || 'Deactivate Selected'),
      message,
      { variant: action === 'deactivate' ? 'warning' : 'info', confirmText: actionLabel, cancelText: dict.common?.cancel || 'Cancel' }
    );
    if (!confirmed) return;

    await bulkToggleStatus(
      Array.from(selectedBundles),
      action,
      async (msg) => {
        toast.success(msg);
        setSelectedBundles(new Set());
        await refetch();
      },
      (error) => toast.error(error)
    );
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
    if (!dict) return;

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
      [hCategory]: categoryName(bundle),
      [hPrice]: bundle.price,
      [hItemsCount]: bundle.items.length,
      [hStatus]: bundle.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive'),
      [hDescription]: bundle.description || '',
      [hCreatedAt]: formatDateTime(bundle.createdAt, settings || getDefaultTenantSettings()),
    }));

    const baseFilename = `bundles_export_${new Date().toISOString().split('T')[0]}`;

    const { arrayToCSV, downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
    if (format === 'csv') {
      const csv = arrayToCSV(exportData, headers);
      downloadCSV(csv, `${baseFilename}.csv`);
    } else if (format === 'excel') {
      await downloadExcel(exportData, headers, baseFilename);
    } else if (format === 'pdf') {
      await downloadPDF(exportData, headers, baseFilename, dict.admin?.bundles || 'Bundles');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setFilterActive(null);
    setFilterCategory('');
    setFilterMinPrice('');
    setFilterMaxPrice('');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  if (!dict || !loadedOnce) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const title = dict.admin?.bundles || 'Product Bundles';

  if (!canManage) {
    return (
      <RegisterPage tagNo="BN" tag={settings?.companyName} title={title}>
        <section className="mt-6 max-w-2xl">
          <div className="border-l-4 border-stamp bg-paper-white px-5 py-4 text-ink">
            <h2 className="text-3xl">{dict.admin?.accessRestricted || 'Access Restricted'}</h2>
            <p className="mt-2 text-sm">
              {dict.admin?.accessRestrictedBundles || "You don't have permission to manage bundles. Contact an admin or owner."}
            </p>
          </div>
          <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
        </section>
      </RegisterPage>
    );
  }

  const activeCount = bundles.filter((bundle) => bundle.isActive).length;
  const advancedCount = [filterCategory, filterMinPrice, filterMaxPrice, filterStartDate, filterEndDate].filter(Boolean).length;
  const anyFilter = !!debouncedSearch || filterActive !== null || advancedCount > 0;
  const exportFormats = [
    { format: 'csv', label: 'CSV', title: dict.admin?.exportCSV || 'Export CSV' },
    { format: 'excel', label: 'Excel', title: dict.admin?.exportExcel || 'Export Excel' },
    { format: 'pdf', label: 'PDF', title: dict.admin?.exportPDF || 'Export PDF' },
  ] as const;
  const analyticsRows = (analytics?.analytics ?? []) as Array<{
    bundleId: string; bundleName: string; bundlePrice: number; totalSales: number;
    totalQuantity: number; transactionCount: number; averageOrderValue: number;
  }>;
  const analyticsTotal = analytics?.summary.totalSales ?? 0;
  const openForm = (bundle: Bundle | null) => {
    setEditingBundle(bundle);
    setShowBundleModal(true);
  };

  return (
    <RegisterPage
      tagNo="BN"
      tag={settings?.companyName}
      title={title}
      subtitle={dict.admin?.bundlesDescription || 'Manage product bundles and packages'}
      side={<LedReadout value={activeCount} label={dict.admin?.activeBundles || 'Active bundles'} />}
    >
      {confirmDialog}

      {!bundlesAllowed && (
        <div className="mt-6 max-w-3xl">
          <Strip tone="error">
            <p className="font-semibold uppercase">{dict.admin?.bundlesNotAvailable || 'Bundles Not Available'}</p>
            <p className="mt-1 font-body">
              {(dict.admin?.bundlesNotAvailableDesc || 'Product bundles are not available for {businessType}.').replace('{businessType}', businessTypeConfig?.name || 'your business type')}
            </p>
            <p className="mt-1 font-body text-ink/70">
              {dict.admin?.bundlesNotAvailableHint || 'If you need bundles, please update your business type in Settings.'}
            </p>
          </Strip>
        </div>
      )}

      {bundlesAllowed && (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
          <Link href={`/${tenant}/${lang}/admin/file-upload`} className={DARK_KEY}>
            <ImageUp className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.uploadImages || 'Upload Images'}
          </Link>
          <button type="button" onClick={() => openForm(null)} className={DARK_KEY_PRIMARY}>
            <Plus className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.addBundle || 'Add Bundle'}
          </button>
        </div>
      )}

      {/* Search, status, more filters and export */}
      <div className="mt-3 border border-white/10 bg-black/20 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] lg:flex lg:items-end">
          <div className="lg:w-80">
            <label htmlFor="bundles-search" className={DARK_LABEL}>{dict.common?.search || 'Search'}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
              <input
                id="bundles-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${DARK_FIELD} pl-9`}
              />
            </div>
          </div>
          <div className="lg:w-44">
            <label htmlFor="bundles-status" className={DARK_LABEL}>{dict.admin?.status || 'Status'}</label>
            <select
              id="bundles-status"
              value={filterActive === null ? 'all' : filterActive.toString()}
              onChange={(e) => {
                const value = e.target.value;
                setFilterActive(value === 'all' ? null : value === 'true');
              }}
              className={DARK_FIELD}
            >
              <option value="all">{dict.common?.all || 'All'}</option>
              <option value="true">{dict.admin?.active || 'Active'}</option>
              <option value="false">{dict.admin?.inactive || 'Inactive'}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            aria-expanded={showAdvancedFilters}
            aria-controls="bundles-more-filters"
            className={`${DARK_KEY} ${showAdvancedFilters ? 'bg-white/10' : ''}`}
          >
            <SlidersHorizontal className={ICON} strokeWidth={1.75} aria-hidden />
            {dict.admin?.advancedFilters || 'Advanced Filters'}
            {advancedCount > 0 && <span className="bg-[#7df0d6] px-1.5 text-ink">{advancedCount}</span>}
          </button>
          <div role="group" aria-label={dict.admin?.export || 'Export'} className="flex divide-x divide-white/25 border border-white/25 sm:col-span-2 lg:ml-auto">
            <span className="flex items-center px-3 text-white/60" title={dict.admin?.export || 'Export'}>
              <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
            {exportFormats.map(({ format, label, title: exportTitle }) => (
              <button
                key={format}
                type="button"
                onClick={() => handleExport(format)}
                disabled={bundles.length === 0}
                title={exportTitle}
                aria-label={exportTitle}
                className="flex min-h-[44px] flex-1 items-center justify-center px-4 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 touch-manipulation disabled:opacity-40 lg:flex-none"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {showAdvancedFilters && (
          <div id="bundles-more-filters" className="mt-3 grid grid-cols-2 gap-3 border-t border-dashed border-white/15 pt-3 md:grid-cols-3 xl:grid-cols-6 xl:items-end">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="bundles-category" className={DARK_LABEL}>{dict.admin?.category || 'Category'}</label>
              <select id="bundles-category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={DARK_FIELD}>
                <option value="">{dict.common?.all || 'All'}</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bundles-min" className={DARK_LABEL}>{dict.admin?.minPrice || 'Min Price'}</label>
              <input id="bundles-min" type="number" step="0.01" min="0" value={filterMinPrice} onChange={(e) => setFilterMinPrice(e.target.value)} className={DARK_FIELD} placeholder="0.00" />
            </div>
            <div>
              <label htmlFor="bundles-max" className={DARK_LABEL}>{dict.admin?.maxPrice || 'Max Price'}</label>
              <input id="bundles-max" type="number" step="0.01" min="0" value={filterMaxPrice} onChange={(e) => setFilterMaxPrice(e.target.value)} className={DARK_FIELD} />
            </div>
            <div>
              <label htmlFor="bundles-from" className={DARK_LABEL}>{dict.admin?.createdFrom || 'Created from'}</label>
              <input id="bundles-from" type="date" value={filterStartDate} max={filterEndDate || undefined} onChange={(e) => setFilterStartDate(e.target.value)} className={DARK_FIELD} />
            </div>
            <div>
              <label htmlFor="bundles-to" className={DARK_LABEL}>{dict.admin?.createdTo || 'Created to'}</label>
              <input id="bundles-to" type="date" value={filterEndDate} min={filterStartDate || undefined} onChange={(e) => setFilterEndDate(e.target.value)} className={DARK_FIELD} />
            </div>
            <button type="button" onClick={clearFilters} disabled={!anyFilter} className={`${DARK_KEY} col-span-2 md:col-span-1`}>
              <X className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.common?.clear || 'Clear'}
            </button>
          </div>
        )}
      </div>

      {/* What to do with the ticked bundles */}
      {selectedBundles.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 bg-brand px-3 py-2 text-ink" role="region" aria-label={dict.admin?.selected || 'Selected'}>
          <p className="flex items-baseline gap-2 font-receipt text-sm font-semibold uppercase">
            <span className="font-led text-3xl leading-none">{selectedBundles.size}</span>
            {dict.admin?.selected || 'selected'}
          </p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button type="button" onClick={() => handleBulkOperation('activate')} className={KEY_PRIMARY}>
              {dict.admin?.bulkActivate || 'Activate Selected'}
            </button>
            <button type="button" onClick={() => handleBulkOperation('deactivate')} className={`${KEY} border-ink/50 hover:bg-[#8fe3d0]`}>
              {dict.admin?.bulkDeactivate || 'Deactivate Selected'}
            </button>
            <button type="button" onClick={() => setSelectedBundles(new Set())} className={`${KEY} col-span-2 border-ink/50 hover:bg-[#8fe3d0] sm:col-span-1`}>
              {dict.common?.cancel || 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Each bundle printed as its own combo ticket */}
      <section className="mt-6" aria-busy={loading} aria-label={title}>
        {bundles.length > 0 && (
          <label className="mb-3 inline-flex min-h-[44px] cursor-pointer items-center gap-3 font-receipt text-xs uppercase tracking-[0.14em] text-white/70">
            <input
              type="checkbox"
              checked={selectedBundles.size === bundles.length}
              onChange={handleSelectAll}
              className="h-5 w-5 cursor-pointer accent-[#7df0d6]"
            />
            {dict.common?.selectAll || 'Select all'}
            {loading && <LoadingSpinner size="sm" color="#8fe3d0" />}
          </label>
        )}

        {bundles.length === 0 ? (
          <div className="max-w-2xl">
            <div className="bg-paper-white px-4 py-14 text-center text-ink">
              <Layers className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
              <p className="font-receipt text-sm text-ink/60">
                {anyFilter ? (dict.common?.noResults || 'No bundles found') : (dict.admin?.noBundlesYet || 'No bundles yet')}
              </p>
              {anyFilter ? (
                <button type="button" onClick={clearFilters} className={`${KEY} mx-auto mt-4`}>{dict.common?.clear || 'Clear'}</button>
              ) : bundlesAllowed && (
                <button type="button" onClick={() => openForm(null)} className={`${KEY_PRIMARY} mx-auto mt-4`}>
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addBundle || 'Add Bundle'}
                </button>
              )}
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </div>
        ) : (
          <ul className={`grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {bundles.map((bundle) => {
              const selected = selectedBundles.has(bundle._id);
              const category = categoryName(bundle);
              return (
                <li key={bundle._id} className="min-w-0">
                  <article className={`flex h-full flex-col ${selected ? 'bg-[#e4f7f1]' : 'bg-paper-white'} ${bundle.isActive ? 'text-ink' : 'text-ink/60'}`}>
                    <header className="flex items-start gap-3 border-b border-dashed border-ink/30 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleSelectBundle(bundle._id)}
                        className={`${CHECKBOX} mt-1`}
                        aria-label={(dict.admin?.selectBundle || 'Select {name}').replace('{name}', bundle.name)}
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-2xl leading-tight [overflow-wrap:anywhere]">{bundle.name}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-receipt text-xs text-ink/60">
                          <span className={`border px-1.5 py-0.5 uppercase ${bundle.isActive ? 'border-ink/25 text-ink/70' : 'border-dashed border-ink/40'}`}>
                            {bundle.isActive ? (dict.admin?.active || 'Active') : (dict.admin?.inactive || 'Inactive')}
                          </span>
                          {bundle.sku && <span>{bundle.sku}</span>}
                          {category && <span>· {category}</span>}
                        </p>
                      </div>
                    </header>

                    {bundle.description && (
                      <p className="px-4 pt-3 text-sm text-ink/65 line-clamp-2">{bundle.description}</p>
                    )}

                    <ul className="space-y-1 px-4 py-3 font-receipt text-sm">
                      {bundle.items.map((item, index) => (
                        <li key={`${itemId(item)}-${index}`} className="flex items-baseline gap-2">
                          <span className="w-8 shrink-0 text-right text-ink/60">{item.quantity}×</span>
                          <span className="min-w-0 truncate" title={item.productName}>{item.productName}</span>
                        </li>
                      ))}
                      {bundle.items.length === 0 && <li className="text-ink/50">—</li>}
                    </ul>

                    <div className="mt-auto flex items-baseline gap-2 border-t border-dashed border-ink/30 px-4 py-3 font-receipt">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink/60">{dict.admin?.price || 'Price'}</span>
                      <span className="mk-leader" aria-hidden />
                      <Currency amount={bundle.price} className="text-lg font-semibold" />
                    </div>

                    <div className="flex items-center justify-end gap-1 border-t border-ink/10 px-2 py-1">
                      <button
                        type="button"
                        onClick={() => openForm(bundle)}
                        disabled={!bundlesAllowed}
                        className={`${ROW_KEY} disabled:opacity-40`}
                        title={dict.common?.edit || 'Edit'}
                        aria-label={`${dict.common?.edit || 'Edit'}: ${bundle.name}`}
                      >
                        <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(bundle)}
                        className={`${ROW_KEY} w-auto gap-2 px-3 font-receipt text-xs uppercase`}
                        aria-label={`${bundle.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}: ${bundle.name}`}
                      >
                        <Power className={ICON} strokeWidth={1.75} aria-hidden />
                        {bundle.isActive ? (dict.admin?.deactivate || 'Deactivate') : (dict.admin?.activate || 'Activate')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBundle(bundle)}
                        className={`${ROW_KEY} hover:text-stamp`}
                        title={dict.common?.delete || 'Delete'}
                        aria-label={`${dict.common?.delete || 'Delete'}: ${bundle.name}`}
                      >
                        <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
                      </button>
                    </div>
                  </article>
                  <div className={`mk-tear-b h-3 ${selected ? 'bg-[#e4f7f1]' : 'bg-paper-white'}`} aria-hidden />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Sales of each bundle over a date range */}
      <section className="mt-10 border-t border-dashed border-white/20 pt-6">
        <button
          type="button"
          onClick={() => setShowAnalytics(!showAnalytics)}
          aria-expanded={showAnalytics}
          aria-controls="bundles-analytics"
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#8fe3d0]" strokeWidth={1.75} aria-hidden />
            <span className="font-display text-3xl font-extrabold uppercase text-paper-white">{dict.admin?.bundleAnalytics || 'Bundle Analytics'}</span>
          </span>
          <ChevronDown className={`h-5 w-5 text-white/60 transition-transform ${showAnalytics ? 'rotate-180' : ''}`} strokeWidth={1.75} aria-hidden />
        </button>

        {showAnalytics && (
          <div id="bundles-analytics" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 border border-white/10 bg-black/20 p-3 md:flex">
              <div className="md:w-52">
                <label htmlFor="bundles-an-start" className={DARK_LABEL}>{dict.reports?.startDate || 'Start Date'}</label>
                <input id="bundles-an-start" type="date" value={analyticsStartDate} max={analyticsEndDate || undefined} onChange={(e) => setAnalyticsStartDate(e.target.value)} className={DARK_FIELD} />
              </div>
              <div className="md:w-52">
                <label htmlFor="bundles-an-end" className={DARK_LABEL}>{dict.reports?.endDate || 'End Date'}</label>
                <input id="bundles-an-end" type="date" value={analyticsEndDate} min={analyticsStartDate || undefined} onChange={(e) => setAnalyticsEndDate(e.target.value)} className={DARK_FIELD} />
              </div>
            </div>

            {analyticsLoading ? (
              <LoadingSpinner size="md" color="#8fe3d0" className="py-10" />
            ) : analytics && (
              <>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <Readout led label={dict.admin?.totalBundles || 'Total Bundles'}>{analytics.summary.totalBundles}</Readout>
                  <Readout label={dict.admin?.totalSales || 'Total Sales'}><Currency amount={analytics.summary.totalSales} /></Readout>
                  <Readout led label={dict.admin?.totalQuantity || 'Total Quantity'}>{analytics.summary.totalQuantity}</Readout>
                  <Readout led label={dict.admin?.totalTransactions || 'Transactions'}>{analytics.summary.totalTransactions}</Readout>
                </div>

                <div className="space-y-4">
                  <section className="min-w-0 max-w-3xl">
                    <div className="bg-paper-white text-ink">
                      <h3 className="border-b border-dashed border-ink/30 px-4 py-3 font-display text-3xl font-extrabold uppercase">
                        {dict.admin?.salesByBundle || 'Sales by bundle'}
                      </h3>
                      {analyticsRows.length === 0 || analyticsTotal <= 0 ? (
                        <p className="p-4 font-receipt text-sm text-ink/60">{dict.admin?.noAnalyticsData || 'No sales data for selected period'}</p>
                      ) : (
                        <ul className="space-y-3 p-4">
                          {[...analyticsRows].sort((a, b) => b.totalSales - a.totalSales).map((row) => {
                            const share = Math.min(100, Math.max(0, (row.totalSales / analyticsTotal) * 100));
                            return (
                              <li key={row.bundleId} className="font-receipt text-sm">
                                <div className="flex items-baseline gap-2">
                                  <span className="min-w-0 truncate" title={row.bundleName}>{row.bundleName}</span>
                                  <span className="mk-leader" aria-hidden />
                                  <Currency amount={row.totalSales} className="whitespace-nowrap font-medium" />
                                  <span className="w-10 shrink-0 text-right text-ink/60">{share.toFixed(0)}%</span>
                                </div>
                                <div className="mt-1 h-2 bg-ink/10" aria-hidden>
                                  <div className="h-full bg-brand-hover" style={{ width: `${share}%` }} />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                  </section>

                  {analyticsRows.length > 0 && (
                    <section className="min-w-0">
                      <div className="bg-paper-white text-ink">
                        <div className="overflow-x-auto" role="region" aria-label={dict.admin?.bundleAnalytics || 'Bundle Analytics'} tabIndex={0}>
                          <table className="min-w-full">
                            <thead className="border-b border-dashed border-ink/30">
                              <tr>
                                <th scope="col" className={TH}>{dict.admin?.bundle || 'Bundle'}</th>
                                <th scope="col" className={`${TH} text-right`}>{dict.admin?.price || 'Price'}</th>
                                <th scope="col" className={`${TH} text-right`}>{dict.admin?.totalSales || 'Total Sales'}</th>
                                <th scope="col" className={`${TH} text-right`}>{dict.admin?.quantity || 'Quantity'}</th>
                                <th scope="col" className={`${TH} text-right`}>{dict.admin?.transactions || 'Transactions'}</th>
                                <th scope="col" className={`${TH} text-right`}>{dict.admin?.avgOrderValue || 'Avg Order Value'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-dashed divide-ink/20">
                              {analyticsRows.map((item) => (
                                <tr key={item.bundleId} className="hover:bg-paper">
                                  <td className={`${TD} font-medium`}>{item.bundleName}</td>
                                  <td className={`${TD} text-right text-ink/70`}><Currency amount={item.bundlePrice} /></td>
                                  <td className={`${TD} text-right font-semibold`}><Currency amount={item.totalSales} /></td>
                                  <td className={`${TD} text-right`}>{item.totalQuantity}</td>
                                  <td className={`${TD} text-right text-ink/70`}>{item.transactionCount}</td>
                                  <td className={`${TD} text-right text-ink/70`}><Currency amount={item.averageOrderValue} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
                    </section>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

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
            refetch();
            setShowBundleModal(false);
            setEditingBundle(null);
          }}
          dict={dict}
        />
      )}
    </RegisterPage>
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
  dict: Dict;
}) {
  const { formData, setFormData, error, submitting, handleSubmit: submitForm } = useBundleForm(bundle, dict);
  const [productSearch, setProductSearch] = useState('');
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [localError, setLocalError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const suggestionItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const alreadyInBundle = dict?.admin?.productAlreadyInBundle || 'This product is already in the bundle';

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) {
      // Show all products when search is empty (limit to first 20 for performance)
      return products.slice(0, 20);
    }

    const searchLower = productSearch.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/);

    // Get products that match, with scoring for better sorting
    return products
      .map(product => {
        const nameLower = (product.name || '').toLowerCase();
        const skuLower = (product.sku || '').toLowerCase();
        const descLower = (product.description || '').toLowerCase();

        const allTermsMatch = searchTerms.every(term =>
          nameLower.includes(term) ||
          skuLower.includes(term) ||
          descLower.includes(term)
        );
        if (!allTermsMatch) return null;

        let score = 0;
        if (nameLower === searchLower) score += 1000;
        else if (nameLower.startsWith(searchLower)) score += 50;
        else if (nameLower.includes(searchLower)) score += 10;
        if (skuLower === searchLower) score += 500;
        else if (skuLower.includes(searchLower)) score += 20;
        if (descLower.includes(searchLower)) score += 5;

        return { product, score };
      })
      .filter((item): item is { product: Product; score: number } => item !== null)
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
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
        setSelectedProduct(filteredProducts[0]);
      } else {
        setSelectedProduct(null);
      }
    } else {
      setSelectedProduct(null);
    }
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

  const flagDuplicate = () => {
    setLocalError(alreadyInBundle);
    setTimeout(() => setLocalError(''), 3000);
  };

  const addProduct = (productToAdd: Product) => {
    if (formData.items.some(item => itemId(item) === productToAdd._id)) {
      flagDuplicate();
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
    setLocalError('');
    setSelectedProduct(null);
    setProductSearch('');
    setItemQuantity(1);
    setShowProductSuggestions(false);
    setHighlightedIndex(-1);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleAddItem = () => {
    // Use highlighted product, selected product, or try to find match
    let productToAdd = highlightedIndex >= 0 ? filteredProducts[highlightedIndex] : selectedProduct;

    if (!productToAdd && productSearch.trim()) {
      const exactMatch = products.find(p => p.name.toLowerCase() === productSearch.toLowerCase());
      if (exactMatch) {
        productToAdd = exactMatch;
      } else if (filteredProducts.length === 1) {
        productToAdd = filteredProducts[0];
      }
    }

    if (productToAdd) addProduct(productToAdd);
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowProductSuggestions(true);
      setHighlightedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
      if (highlightedIndex + 1 < filteredProducts.length) {
        suggestionItemsRef.current[highlightedIndex + 1]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
      if (highlightedIndex > 0) {
        suggestionItemsRef.current[highlightedIndex - 1]?.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const productToSelect = highlightedIndex >= 0
        ? filteredProducts[highlightedIndex]
        : filteredProducts.length > 0
          ? filteredProducts[0]
          : selectedProduct;
      if (productToSelect) addProduct(productToSelect);
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

  // Mark the part of a name that matches the search
  const highlightMatch = (text: string, search: string) => {
    if (!search.trim()) return text;
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === search.toLowerCase() ? (
        <mark key={i} className="bg-[#8fe3d0] font-semibold text-ink">{part}</mark>
      ) : part
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitForm(
      async () => {
        toast.success(dict?.admin?.bundleSavedSuccessfully || 'Bundle saved successfully');
        onSave();
      },
      (errorMsg) => {
        toast.error(errorMsg);
      }
    );
  };

  const canAdd = !!selectedProduct || highlightedIndex >= 0 || filteredProducts.length === 1 || !!productSearch.trim();
  const listboxId = 'bundle-product-options';

  return (
    <Sheet
      wide
      title={bundle ? (dict.admin?.editBundle || 'Edit Bundle') : (dict.admin?.addBundle || 'Add Bundle')}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="bundle-form" disabled={submitting} className={KEY_PRIMARY}>
            {submitting ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="bundle-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bundle-name" className={LABEL}>{dict.admin?.name || 'Name'} *</label>
            <input
              id="bundle-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="bundle-sku" className={LABEL}>{dict.admin?.sku || 'SKU'}</label>
            <input
              id="bundle-sku"
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className={`${INPUT} font-receipt`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="bundle-description" className={LABEL}>{dict.admin?.description || 'Description'}</label>
          <textarea
            id="bundle-description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className={INPUT}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bundle-price" className={LABEL}>{dict.admin?.price || 'Price'} *</label>
            <input
              id="bundle-price"
              type="number"
              step="0.01"
              min="0"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className={`${INPUT} font-receipt`}
            />
          </div>
          <div>
            <label htmlFor="bundle-category" className={LABEL}>{dict.admin?.category || 'Category'}</label>
            <select
              id="bundle-category"
              value={formData.categoryId || ''}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className={INPUT}
            >
              <option value="">{dict.common?.none || 'None'}</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* What goes in the bundle */}
        <fieldset className="border-t border-dashed border-ink/30 pt-4">
          <legend className={`${LABEL} float-left w-full`}>{dict.admin?.bundleItems || 'Bundle Items'} *</legend>

          <div className="clear-left grid grid-cols-[minmax(0,1fr)_5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto]">
            <div className="relative col-span-2 sm:col-span-1">
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded={showProductSuggestions}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-label={dict.admin?.searchProduct || 'Search products...'}
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setShowProductSuggestions(true);
                }}
                onFocus={() => {
                  if (!productsLoading) setShowProductSuggestions(true);
                }}
                onKeyDown={handleProductSearchKeyDown}
                placeholder={dict.admin?.searchProduct || 'Search products...'}
                className={INPUT}
                autoComplete="off"
              />
              {showProductSuggestions && (
                <div
                  ref={suggestionsRef}
                  id={listboxId}
                  role="listbox"
                  className="absolute top-full z-[100] mt-1 max-h-60 w-full overflow-y-auto border border-ink bg-paper-white"
                >
                  {productsLoading ? (
                    <p className="px-3 py-2 font-receipt text-sm text-ink/60">{dict.admin?.loadingProducts || 'Loading products...'}</p>
                  ) : products.length === 0 ? (
                    <p className="px-3 py-2 font-receipt text-sm text-ink/60">{dict.admin?.noProductsAvailable || 'No products available'}</p>
                  ) : filteredProducts.length > 0 ? (
                    filteredProducts.map((product, index) => {
                      const isHighlighted = index === highlightedIndex;
                      const isAlreadyAdded = formData.items.some(item => itemId(item) === product._id);
                      return (
                        <button
                          key={product._id}
                          ref={el => { suggestionItemsRef.current[index] = el; }}
                          type="button"
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => {
                            if (isAlreadyAdded) {
                              flagDuplicate();
                              return;
                            }
                            setSelectedProduct(product);
                            setProductSearch(product.name);
                            setShowProductSuggestions(false);
                            setHighlightedIndex(-1);
                          }}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={`block min-h-[44px] w-full border-b border-dashed border-ink/15 px-3 py-2 text-left last:border-b-0 focus:outline-none ${isHighlighted ? 'bg-paper' : 'hover:bg-paper'} ${isAlreadyAdded ? 'cursor-not-allowed opacity-50' : ''}`}
                          disabled={isAlreadyAdded}
                        >
                          <span className="flex items-center justify-between gap-2 text-sm font-medium">
                            <span className="min-w-0 truncate">{highlightMatch(product.name, productSearch)}</span>
                            {isAlreadyAdded && (
                              <span className="shrink-0 font-receipt text-[11px] uppercase text-ink/50">{dict?.admin?.alreadyAdded || 'Already added'}</span>
                            )}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-receipt text-xs text-ink/60">
                            <Currency amount={product.price} />
                            {product.sku && <span>{highlightMatch(product.sku, productSearch)}</span>}
                            {product.stock !== undefined && (
                              <span className={product.stock === 0 ? 'font-semibold text-stamp' : ''}>
                                {dict?.admin?.stock || 'Stock'} {product.stock}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-2 font-receipt text-sm text-ink/60">{dict.admin?.noProductsFound || 'No products found'}</p>
                  )}
                </div>
              )}
            </div>
            <input
              type="number"
              min="1"
              value={itemQuantity}
              onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
              aria-label={dict.admin?.quantity || 'Quantity'}
              className={`${INPUT_BASE} w-full text-right font-receipt`}
            />
            <button type="button" onClick={handleAddItem} disabled={!canAdd} className={KEY_PRIMARY}>
              <Plus className={ICON} strokeWidth={1.75} aria-hidden />
              {dict.common?.add || 'Add'}
            </button>
          </div>
          <div aria-live="polite">
            {localError && <p className="mt-2 border-l-2 border-stamp pl-2 font-receipt text-xs text-stamp">{localError}</p>}
          </div>

          <ul className="mt-3 divide-y divide-dashed divide-ink/20 border-y border-dashed border-ink/30">
            {formData.items.map((item, index) => (
              <li key={`${itemId(item)}-${index}`} className="flex items-center gap-2 py-1 font-receipt text-sm">
                <span className="w-10 shrink-0 text-right text-ink/60">{item.quantity}×</span>
                <span className="min-w-0 flex-1 truncate">{item.productName}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className={`${ROW_KEY} hover:text-stamp`}
                  title={dict.common?.remove || 'Remove'}
                  aria-label={`${dict.common?.remove || 'Remove'}: ${item.productName}`}
                >
                  <X className={ICON} strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
            {formData.items.length === 0 && (
              <li className="py-4 text-center font-receipt text-sm text-ink/60">
                {dict.admin?.noItems || 'No items added. Add products to create a bundle.'}
              </li>
            )}
          </ul>
          <p className={HINT}>{dict.admin?.bundleItemsHint || 'Search by name or SKU, then press Enter or Add.'}</p>
        </fieldset>

        <label className={CHECK_ROW}>
          <input
            type="checkbox"
            checked={formData.trackInventory}
            onChange={(e) => setFormData({ ...formData, trackInventory: e.target.checked })}
            className={CHECKBOX}
          />
          <span className="font-medium">{dict.admin?.trackInventory || 'Track Inventory'}</span>
        </label>

        {error && <Strip tone="error">{error}</Strip>}
      </form>
    </Sheet>
  );
}
