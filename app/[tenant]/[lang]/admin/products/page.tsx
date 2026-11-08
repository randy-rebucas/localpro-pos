'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BarcodeModal = dynamic(() => import('@/components/BarcodeModal'), { ssr: false });
const ProductImportModal = dynamic(() => import('@/components/ProductImportModal'), { ssr: false });
const BulkBarcodeModal = dynamic(() => import('@/components/BulkBarcodeModal'), { ssr: false });
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { LineTag } from '@/components/marketing/primitives';
import {
  ICON, DARK_LABEL, DARK_FIELD, DARK_KEY, DARK_KEY_PRIMARY, LABEL, INPUT_BASE, INPUT, CHECKBOX, HINT, KEY, KEY_PRIMARY, CHECK_ROW, ROW_KEY, Sheet, Strip,
} from '@/components/admin/register-ui';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SlipPager from '@/components/ui/SlipPager';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getBusinessTypeConfig } from '@/lib/business-types';
import { getBusinessType } from '@/lib/business-type-helpers';
// Variation products keep their stock on the variations; the main figure is unused there
import { productStockTotal } from '@/lib/product-variations';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Barcode, Check, Download, ImageUp, Package, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, Upload, X,
} from 'lucide-react';
import { useProductsList, type Product, type Category } from '@/hooks/useProductsList';
import { useProductsForm } from '@/hooks/useProductsForm';
import type { BulkProductUpdates } from '@/lib/validation';
import {
  getProductDeletedMessage,
  getProductDeleteErrorMessage,
  getDeleteProductConfirmTitle,
  getDeleteProductConfirmMessage,
  getBulkProductUpdateConfirmMessage,
  getBulkProductUpdateSuccessMessage,
  generateEAN13 as generateEAN13Helper,
} from '@/lib/products-helpers';

// Table
const TH = 'whitespace-nowrap px-4 py-2 text-left font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60';
const TD = 'px-4 py-3 font-receipt text-sm';

const PAGE_SIZE = 20;
type Dict = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A category search box with its suggestion list. */
function CategoryPicker({ inputRef, listRef, value, selectedId, options, open, onType, onFocus, onPick, placeholder, emptyLabel, inputId }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  value: string;
  selectedId: string;
  options: Category[];
  open: boolean;
  onType: (value: string) => void;
  onFocus: () => void;
  onPick: (category: Category) => void;
  placeholder: string;
  emptyLabel?: string;
  inputId?: string;
}) {
  return (
    <div className="relative">
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        className={INPUT}
      />
      {open && options.length > 0 && (
        <div ref={listRef} className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto border border-ink bg-paper-white">
          {options.map((cat) => (
            <button
              key={cat._id}
              type="button"
              onClick={() => onPick(cat)}
              className={`flex min-h-[44px] w-full items-center px-3 text-left text-sm text-ink transition-colors hover:bg-paper focus:bg-paper focus:outline-none ${selectedId === cat._id ? 'bg-paper font-semibold' : ''}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
      {open && emptyLabel && value && options.length === 0 && (
        <div ref={listRef} className="absolute z-50 mt-1 w-full border border-ink bg-paper-white p-3 font-receipt text-sm text-ink/60">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

const productTypeLabel = (dict: Dict, type: string) =>
  type === 'regular' ? (dict.admin?.regular || 'Regular')
    : type === 'bundle' ? (dict.admin?.bundle || 'Bundle')
      : type === 'service' ? (dict.admin?.service || 'Service')
        : type;

export default function ProductsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showProductModal, setShowProductModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'missing-barcode' | 'all'>('missing-barcode');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkRestockModal, setShowBulkRestockModal] = useState(false);
  const [showBulkBarcodeModal, setShowBulkBarcodeModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const { settings } = useTenantSettings();
  const { confirm, Dialog } = useConfirm();
  const { canAccess } = usePermissions();
  const canManage = canAccess('products.manage');
  const [businessTypeConfig, setBusinessTypeConfig] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const {
    products,
    categories,
    loading,
    pagination,
    message,
    fetchProducts,
    fetchCategories,
    deleteProduct,
    bulkUpdateProducts,
  } = useProductsList(tenant, dict);

  const loadProducts = useCallback(() => {
    fetchProducts({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch,
      filter: productFilter === 'all' ? undefined : productFilter,
      isActive: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : 'all',
    });
  }, [fetchProducts, page, debouncedSearch, productFilter, statusFilter]);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
    fetchCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, tenant]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    setSelectedProducts(new Set());
  }, [page, debouncedSearch, productFilter, statusFilter]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedProducts.size > 0 && selectedProducts.size < products.length;
    }
  }, [selectedProducts, products.length]);

  useEffect(() => {
    if (settings) {
      const businessType = getBusinessType(settings);
      const config = getBusinessTypeConfig(businessType);
      setBusinessTypeConfig(config);
    }
  }, [settings]);

  const handleDeleteProduct = async (productId: string) => {
    if (!dict) return;
    const confirmed = await confirm(
      getDeleteProductConfirmTitle(dict),
      getDeleteProductConfirmMessage(dict),
      { variant: 'danger' }
    );
    if (!confirmed) return;
    const result = await deleteProduct(productId);
    if (result.success) {
      showToast.success(getProductDeletedMessage(dict));
      if (products.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        loadProducts();
      }
    } else {
      showToast.error(result.error || getProductDeleteErrorMessage(dict));
    }
  };

  const handleReactivateProduct = async (productId: string) => {
    if (!dict) return;
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });
      const result = await res.json();
      if (result.success) {
        showToast.success(dict.products?.productReactivated || 'Product reactivated');
        loadProducts();
      } else {
        showToast.error(result.error || dict.products?.reactivateError || 'Failed to reactivate product');
      }
    } catch {
      showToast.error(dict.products?.reactivateError || 'Failed to reactivate product');
    }
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map((p) => p._id)));
    }
  };

  const handleSelectProduct = (productId: string) => {
    const next = new Set(selectedProducts);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    setSelectedProducts(next);
  };

  const handleBulkEditSave = async (updates: BulkProductUpdates) => {
    if (selectedProducts.size === 0) return;
    if (!dict) return;

    const confirmed = await confirm(
      dict.products?.bulkEditTitle || 'Bulk Edit Products',
      getBulkProductUpdateConfirmMessage(selectedProducts.size, dict)
    );
    if (!confirmed) return;

    const result = await bulkUpdateProducts(Array.from(selectedProducts), updates);
    if (result.success) {
      showToast.success(
        result.message || getBulkProductUpdateSuccessMessage(result.modifiedCount ?? selectedProducts.size, dict)
      );
      setSelectedProducts(new Set());
      setShowBulkEditModal(false);
      loadProducts();
    } else {
      showToast.error(result.error || dict.products?.bulkUpdateError || 'Failed to update products');
    }
  };

  const handleBulkRestockSave = async (items: Array<{ productId: string; quantity: number }>) => {
    if (items.length === 0 || !dict) return;
    const restockError = dict.products?.restockError || 'Failed to restock products';
    try {
      const res = await fetch('/api/products/bulk-restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items, reason: 'Bulk restock (delivery received)' }),
      });
      const result = await res.json();
      if (result.success) {
        if (result.failed > 0) {
          showToast.error(
            (dict.products?.restockPartial || '{restocked} restocked, {failed} failed: {error}')
              .replace('{restocked}', String(result.restocked))
              .replace('{failed}', String(result.failed))
              .replace('{error}', result.errors?.[0]?.error || '')
          );
        } else {
          showToast.success(
            (dict.products?.restockSuccess || '{count} product(s) restocked').replace('{count}', String(result.restocked))
          );
        }
        setSelectedProducts(new Set());
        setShowBulkRestockModal(false);
        loadProducts();
      } else {
        showToast.error(result.error || restockError);
      }
    } catch {
      showToast.error(restockError);
    }
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf' = 'csv') => {
    if (!dict || exporting) return;

    setExporting(true);
    try {
      let exportProducts: Product[];

      if (selectedProducts.size > 0) {
        exportProducts = products.filter((p) => selectedProducts.has(p._id));
      } else {
        // Everything the list is showing: same search, tab and status, all pages
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (productFilter !== 'all') params.set('filter', productFilter);
        params.set('isActive', statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : 'all');
        const res = await fetch(`/api/products?${params}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || dict.products?.exportError || 'Export failed');
        }
        exportProducts = data.data || [];
      }

      if (exportProducts.length === 0) {
        showToast.error(dict.products?.exportEmpty || 'No products to export');
        return;
      }

      const baseFilename = `products_export_${new Date().toISOString().split('T')[0]}`;
      const { downloadCSV, downloadExcel, downloadPDF } = await import('@/lib/export');
      const {
        productsToExportCSV,
        mapProductToDisplayRow,
        getProductDisplayExportHeaders,
      } = await import('@/lib/product-export');

      const labels = {
        name: dict.admin?.name || 'Name',
        sku: 'SKU',
        category: dict.admin?.category || 'Category',
        price: dict.admin?.price || 'Price',
      };

      if (format === 'csv') {
        downloadCSV(productsToExportCSV(exportProducts), `${baseFilename}.csv`);
      } else {
        const headers = getProductDisplayExportHeaders(labels);
        const exportData = exportProducts.map((product) => mapProductToDisplayRow(product, labels));

        if (format === 'excel') {
          await downloadExcel(exportData, headers, baseFilename);
        } else {
          await downloadPDF(exportData, headers, baseFilename, dict.admin?.products || 'Products');
        }
      }

      showToast.success(
        (dict.products?.exportSuccess || 'Exported {count} product(s)').replace(
          '{count}',
          String(exportProducts.length)
        )
      );
    } catch (error) {
      showToast.error(
        error instanceof Error
          ? error.message
          : dict.products?.exportError || 'Failed to export products'
      );
    } finally {
      setExporting(false);
    }
  };

  if (!dict || loading) {
    return (
      <div className="mk-root pos-register">
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-brand-navy-deep lg:min-h-dvh">
          <LoadingSpinner size="md" color="#8fe3d0" />
        </div>
      </div>
    );
  }

  const filterTabs = [
    { value: 'missing-barcode', label: dict.products?.filterMissingBarcode || 'Missing Barcode' },
    { value: 'all', label: dict.products?.filterAll || 'All Products' },
  ] as const;
  const activeTabLabel = filterTabs.find((tab) => tab.value === productFilter)?.label;
  const exportFormats = [
    { format: 'csv', label: 'CSV', title: dict.admin?.exportCSV || 'Export CSV' },
    { format: 'excel', label: 'Excel', title: dict.admin?.exportExcel || 'Export Excel' },
    { format: 'pdf', label: 'PDF', title: dict.admin?.exportPDF || 'Export PDF' },
  ] as const;
  const firstShown = (pagination.page - 1) * pagination.limit + 1;
  const lastShown = Math.min(pagination.page * pagination.limit, pagination.total);
  const allSelected = selectedProducts.size === products.length && products.length > 0;

  const renderActions = (product: Product) => (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={() => setBarcodeProduct(product)}
        className={ROW_KEY}
        title={dict.products?.barcode || 'Barcode'}
        aria-label={`${dict.products?.barcode || 'Barcode'}: ${product.name}`}
      >
        <Barcode className={ICON} strokeWidth={1.75} aria-hidden />
      </button>
      {canManage && (
        <button
          type="button"
          onClick={() => {
            setEditingProduct(product);
            setShowProductModal(true);
          }}
          className={ROW_KEY}
          title={dict.common?.edit || 'Edit'}
          aria-label={`${dict.common?.edit || 'Edit'}: ${product.name}`}
        >
          <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {canManage && (product.isActive === false ? (
        <button
          type="button"
          onClick={() => handleReactivateProduct(product._id)}
          className={`${ROW_KEY} hover:text-brand-hover`}
          title={dict.products?.reactivate || 'Reactivate'}
          aria-label={`${dict.products?.reactivate || 'Reactivate'}: ${product.name}`}
        >
          <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => handleDeleteProduct(product._id)}
          className={`${ROW_KEY} hover:text-stamp`}
          title={dict.common?.delete || 'Delete'}
          aria-label={`${dict.common?.delete || 'Delete'}: ${product.name}`}
        >
          <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );

  return (
    <div className="mk-root pos-register">
      {Dialog}
      <div className="min-h-[calc(100dvh-3.5rem)] bg-brand-navy-deep text-paper lg:min-h-dvh">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          {/* Heading and the count on the display */}
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              {settings?.companyName && (
                <LineTag no="PR" className="mb-3 text-[#8fe3d0]">{settings.companyName}</LineTag>
              )}
              <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{dict.admin?.products || 'Products'}</h1>
              <p className="mt-3 text-paper/70">{dict.admin?.productsSubtitle || 'Manage products, variations, and bundles'}</p>
            </div>
            <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
              <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">{pagination.total}</span>
              <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{activeTabLabel}</span>
            </div>
          </div>

          {/* Which list, and the keys that add to it */}
          <div className="mt-6 flex flex-wrap items-stretch justify-between gap-3">
            <nav className="grid w-full grid-cols-2 border-l border-t border-white/25 sm:inline-grid sm:w-auto" aria-label={dict.common?.tabs || 'Tabs'}>
              {filterTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={productFilter === tab.value}
                  onClick={() => { setProductFilter(tab.value); setPage(1); }}
                  className={`flex min-h-[44px] items-center justify-center border-b border-r border-white/25 px-4 font-receipt text-xs font-medium uppercase transition-colors touch-manipulation ${productFilter === tab.value ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {canManage && (
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button type="button" onClick={() => setShowImportModal(true)} className={DARK_KEY}>
                  <Upload className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.products?.import || 'Import'}
                </button>
                <Link href={`/${tenant}/${lang}/admin/file-upload`} className={DARK_KEY}>
                  <ImageUp className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.products?.uploadImages || 'Upload Images'}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setShowProductModal(true);
                  }}
                  className={`${DARK_KEY_PRIMARY} col-span-2`}
                >
                  <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                  {dict.admin?.addProduct || 'Add Product'}
                </button>
              </div>
            )}
          </div>

          {/* Search, status and export */}
          <div className="mt-3 grid grid-cols-1 gap-3 border border-white/10 bg-black/20 p-3 sm:grid-cols-[minmax(0,1fr)_11rem] lg:flex lg:items-end">
            <div className="lg:w-80">
              <label htmlFor="products-search" className={DARK_LABEL}>{dict.common?.search || 'Search'}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" strokeWidth={1.75} aria-hidden />
                <input
                  id="products-search"
                  type="search"
                  placeholder={dict.products?.searchPlaceholder || 'Name, SKU or barcode'}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className={`${DARK_FIELD} pl-9`}
                />
              </div>
            </div>
            <div className="lg:w-44">
              <label htmlFor="products-status" className={DARK_LABEL}>{dict.products?.statusFilter || 'Status'}</label>
              <select
                id="products-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
                  setPage(1);
                }}
                className={DARK_FIELD}
              >
                <option value="active">{dict.products?.statusActive || 'Active'}</option>
                <option value="inactive">{dict.products?.statusInactive || 'Inactive'}</option>
                <option value="all">{dict.products?.statusAll || 'All'}</option>
              </select>
            </div>
            <div
              role="group"
              aria-label={dict.admin?.export || 'Export'}
              aria-busy={exporting}
              className="flex divide-x divide-white/25 border border-white/25 sm:col-span-2 lg:ml-auto"
            >
              <span className="flex items-center px-3 text-white/60" title={dict.admin?.export || 'Export'}>
                {exporting
                  ? <LoadingSpinner size="sm" color="#8fe3d0" />
                  : <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />}
              </span>
              {exportFormats.map(({ format, label, title }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => handleExport(format)}
                  disabled={exporting}
                  title={title}
                  aria-label={title}
                  className="flex min-h-[44px] flex-1 items-center justify-center px-4 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 touch-manipulation disabled:opacity-50 lg:flex-none"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {message && (
            <div className="mt-3">
              <Strip tone={message.type === 'success' ? 'ok' : 'error'}>{message.text}</Strip>
            </div>
          )}

          {/* What to do with the ticked lines */}
          {selectedProducts.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 bg-brand px-3 py-2 text-ink" role="region" aria-label={dict.admin?.selected || 'Selected'}>
              <p className="flex items-baseline gap-2 font-receipt text-sm font-semibold uppercase">
                <span className="font-led text-3xl leading-none">{selectedProducts.size}</span>
                {dict.admin?.selected || 'selected'}
              </p>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                {canManage && (
                  <button type="button" onClick={() => setShowBulkEditModal(true)} className={KEY_PRIMARY}>
                    {dict.products?.bulkEdit || 'Edit Selected'}
                  </button>
                )}
                {canManage && (
                  <button type="button" onClick={() => setShowBulkRestockModal(true)} className={KEY_PRIMARY}>
                    {dict.products?.restockSelected || 'Restock Selected'}
                  </button>
                )}
                <button type="button" onClick={() => setShowBulkBarcodeModal(true)} className={`${KEY} border-ink/50 hover:bg-[#8fe3d0]`}>
                  {dict.products?.printBarcodes || 'Print Barcodes'}
                </button>
                <button type="button" onClick={() => setSelectedProducts(new Set())} className={`${KEY} border-ink/50 hover:bg-[#8fe3d0]`}>
                  {dict.common?.cancel || 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* The price list */}
          <section className="mt-6 min-w-0">
            <div className="bg-paper-white text-ink">
              {/* Up to xl: one line per product, so price, stock and the keys stay on screen */}
              <div className="xl:hidden">
                {products.length > 0 && (
                  <label className="flex min-h-[44px] items-center gap-3 border-b border-dashed border-ink/30 px-4 font-receipt text-xs uppercase tracking-[0.14em] text-ink/60">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className={CHECKBOX}
                    />
                    {dict.common?.selectAll || 'Select all'}
                  </label>
                )}
                <ul className="divide-y divide-dashed divide-ink/20">
                  {products.map((product) => {
                    const selected = selectedProducts.has(product._id);
                    const low = product.trackInventory && productStockTotal(product) <= (product.lowStockThreshold || 10);
                    const category = typeof product.categoryId === 'object' && product.categoryId?.name ? product.categoryId.name : product.category;
                    return (
                      <li key={product._id} className={`px-4 pb-1 pt-3 ${selected ? 'bg-[#8fe3d0]/25' : ''}`}>
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleSelectProduct(product._id)}
                            className={`${CHECKBOX} mt-0.5`}
                            aria-label={(dict.products?.selectProduct || 'Select {name}').replace('{name}', product.name)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                              {product.name}
                              {product.isActive === false && (
                                <span className="border border-dashed border-ink/40 px-1.5 py-0.5 font-receipt text-[11px] uppercase text-ink/60">
                                  {dict.products?.statusInactive || 'Inactive'}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate font-receipt text-xs text-ink/60">
                              {[product.sku || '-', category, productTypeLabel(dict, product.productType)].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="shrink-0 text-right font-receipt">
                            <p className="text-sm font-semibold"><Currency amount={product.price} /></p>
                            <p className={`text-xs ${low ? 'font-semibold text-stamp' : 'text-ink/60'}`}>
                              {dict.admin?.stock || 'Stock'} {product.trackInventory ? productStockTotal(product) : '∞'}
                            </p>
                          </div>
                        </div>
                        <div className="-mr-2 mt-1">{renderActions(product)}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="hidden overflow-x-auto xl:block" role="region" aria-label={dict.admin?.products || 'Products'} tabIndex={0}>
                <table className="min-w-full">
                  <thead className="border-b border-dashed border-ink/30">
                    <tr>
                      <th scope="col" className="w-12 py-1 pl-2 pr-0">
                        <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allSelected}
                            onChange={handleSelectAll}
                            className={CHECKBOX}
                            aria-label={dict.common?.selectAll || 'Select all'}
                          />
                        </label>
                      </th>
                      <th scope="col" className={TH}>{dict.admin?.name || 'Name'}</th>
                      <th scope="col" className={TH}>SKU</th>
                      <th scope="col" className={TH}>{dict.admin?.category || 'Category'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.price || 'Price'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.admin?.stock || 'Stock'}</th>
                      <th scope="col" className={`${TH} text-right`}>{dict.common?.actions || 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-ink/20">
                    {products.map((product) => {
                      const selected = selectedProducts.has(product._id);
                      const low = product.trackInventory && productStockTotal(product) <= (product.lowStockThreshold || 10);
                      return (
                        <tr key={product._id} className={`transition-colors ${selected ? 'bg-[#8fe3d0]/25' : 'hover:bg-paper'}`}>
                          <td className="w-12 py-1 pl-2 pr-0 align-middle">
                            <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleSelectProduct(product._id)}
                                className={CHECKBOX}
                                aria-label={(dict.products?.selectProduct || 'Select {name}').replace('{name}', product.name)}
                              />
                            </label>
                          </td>
                          <td className={`${TD} min-w-[14rem]`}>
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-ink/5">
                                {product.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={product.image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-ink/30" strokeWidth={1.75} aria-hidden />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 font-body text-sm font-medium">
                                  {product.name}
                                  {(product.productType !== 'regular' || product.hasVariations) && (
                                    <span className="border border-ink/25 px-1.5 py-0.5 font-receipt text-[11px] uppercase text-ink/70">
                                      {productTypeLabel(dict, product.productType)}
                                      {product.hasVariations && ` ${dict.products?.variations || '(variations)'}`}
                                    </span>
                                  )}
                                  {product.isActive === false && (
                                    <span className="border border-dashed border-ink/40 px-1.5 py-0.5 font-receipt text-[11px] uppercase text-ink/60">
                                      {dict.products?.statusInactive || 'Inactive'}
                                    </span>
                                  )}
                                </p>
                                {product.description && (
                                  <p className="mt-0.5 line-clamp-1 max-w-xs font-body text-xs text-ink/60" title={product.description}>
                                    {product.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} whitespace-nowrap`}>
                            <div>{product.sku || '-'}</div>
                            {product.barcode && <div className="mt-0.5 text-xs text-ink/50">{product.barcode}</div>}
                          </td>
                          <td className={`${TD} whitespace-nowrap text-ink/70`}>
                            {typeof product.categoryId === 'object' && product.categoryId?.name ? product.categoryId.name : product.category || '-'}
                          </td>
                          <td className={`${TD} whitespace-nowrap text-right font-semibold`}>
                            <Currency amount={product.price} />
                          </td>
                          <td className={`${TD} whitespace-nowrap text-right ${low ? 'font-semibold text-stamp' : ''}`}>
                            {product.trackInventory ? productStockTotal(product) : '∞'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right">
                            {renderActions(product)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {products.length === 0 && (
                <div className="px-4 py-14 text-center">
                  <Package className="mx-auto mb-2 h-8 w-8 text-ink/20" strokeWidth={1.75} aria-hidden />
                  <p className="font-receipt text-sm text-ink/60">
                    {debouncedSearch ? (dict.common?.noResults || 'No products found') : (dict.common?.noData || 'No products yet')}
                  </p>
                </div>
              )}

              {pagination.pages > 1 && (
                <>
                  <p className="px-4 pt-3 font-receipt text-xs text-ink/60 sm:px-5">
                    {dict.admin?.showing || 'Showing'} {firstShown} {dict.admin?.to || 'to'} {lastShown} {dict.admin?.of || 'of'} {pagination.total} {dict.admin?.results || 'results'}
                  </p>
                  <SlipPager
                    page={page}
                    totalPages={pagination.pages}
                    onPageChange={setPage}
                    label={dict.admin?.page || 'Page'}
                    previousLabel={dict.common?.previous || 'Previous'}
                    nextLabel={dict.common?.next || 'Next'}
                  />
                </>
              )}
            </div>
            <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
          </section>
        </div>

        {barcodeProduct && (
          <BarcodeModal
            value={barcodeProduct.barcode || barcodeProduct.sku || barcodeProduct._id}
            productName={barcodeProduct.name}
            onClose={() => setBarcodeProduct(null)}
          />
        )}

        {showProductModal && (
          <ProductModal
            product={editingProduct}
            categories={categories}
            onClose={() => {
              setShowProductModal(false);
              setEditingProduct(null);
            }}
            onSave={() => {
              loadProducts();
              setShowProductModal(false);
              setEditingProduct(null);
            }}
            dict={dict}
            businessTypeConfig={businessTypeConfig}
            settings={settings}
          />
        )}

        {showImportModal && (
          <ProductImportModal
            dict={dict}
            onClose={() => setShowImportModal(false)}
            onComplete={() => {
              loadProducts();
              fetchCategories();
            }}
          />
        )}

        {showBulkEditModal && (
          <BulkEditModal
            categories={categories}
            dict={dict}
            count={selectedProducts.size}
            businessTypeConfig={businessTypeConfig}
            onClose={() => setShowBulkEditModal(false)}
            onSave={handleBulkEditSave}
          />
        )}

        {showBulkRestockModal && (
          <BulkRestockModal
            products={products.filter((p) => selectedProducts.has(p._id))}
            dict={dict}
            onClose={() => setShowBulkRestockModal(false)}
            onSave={handleBulkRestockSave}
          />
        )}

        {showBulkBarcodeModal && (
          <BulkBarcodeModal
            products={products.filter((p) => selectedProducts.has(p._id))}
            dict={dict}
            onClose={() => setShowBulkBarcodeModal(false)}
          />
        )}
      </div>
    </div>
  );
}

function ProductModal({
  product,
  categories,
  onClose,
  onSave,
  dict,
  businessTypeConfig,
  settings,
}: {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSave: () => void;
  dict: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  businessTypeConfig: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  settings: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}) {
  const { formData, saving, error, updateFormData, submitForm } = useProductsForm(product, businessTypeConfig);
  const { confirm: confirmDialog, Dialog: DuplicateDialog } = useConfirm();
  const [nameDuplicate, setNameDuplicate] = useState<{ _id: string; name: string; sku?: string; stock: number } | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);
  const currencySymbol = settings?.currencySymbol || '₱';
  const showInventory = businessTypeConfig?.defaultFeatures?.enableInventory !== false;
  const closeLabel = dict.common?.close || 'Close';

  // Image picker state
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickerFiles, setPickerFiles] = useState<{ id: string; name: string; url: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerUploading, setPickerUploading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerFileInputRef = useRef<HTMLInputElement>(null);

  const loadPickerFiles = useCallback(async () => {
    setPickerLoading(true);
    try {
      const res = await fetch('/api/upload', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPickerFiles(data.data.filter((f: { type: string }) => f.type.startsWith('image/')));
      }
    } catch {
      // silent
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const openImagePicker = () => {
    setShowImagePicker(true);
    setPickerSearch('');
    loadPickerFiles();
  };

  const handlePickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickerUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'products'); // Cloudinary folder 1pos/{slug}/products/
      const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        updateFormData({ image: data.data.url });
        setShowImagePicker(false);
      } else {
        showToast.error(data?.error || dict?.products?.failedToUploadImage || 'Failed to upload image');
      }
    } catch {
      showToast.error(dict?.products?.uploadFailed || 'Upload failed');
    } finally {
      setPickerUploading(false);
      if (pickerFileInputRef.current) pickerFileInputRef.current.value = '';
    }
  };

  // Initialize category search with current category name
  useEffect(() => {
    if (product?.categoryId) {
      const currentCategory = categories.find(
        cat => cat._id === (typeof product.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product.categoryId)
      );
      if (currentCategory) {
        setCategorySearch(currentCategory.name);
      } else {
        setCategorySearch('');
      }
    } else {
      setCategorySearch('');
    }
  }, [product, categories]);

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch, categories]);

  // Handle category selection
  const handleCategorySelect = (category: Category) => {
    updateFormData({ categoryId: category._id });
    setCategorySearch(category.name);
    setShowCategorySuggestions(false);
  };

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryInputRef.current &&
        categoryListRef.current &&
        !categoryInputRef.current.contains(event.target as Node) &&
        !categoryListRef.current.contains(event.target as Node)
      ) {
        setShowCategorySuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkDuplicateName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        setNameDuplicate(null);
        return;
      }
      setCheckingName(true);
      try {
        const params = new URLSearchParams({ name: trimmed });
        if (product?._id) params.set('excludeId', product._id);
        const res = await fetch(`/api/products/check-duplicate?${params}`, { credentials: 'include' });
        const data = await res.json();
        setNameDuplicate(data.success && data.exists ? data.product : null);
      } catch {
        // Non-blocking: live check failing shouldn't stop the user from typing/submitting
      } finally {
        setCheckingName(false);
      }
    },
    [product?._id]
  );

  // Debounced check while typing
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicateName(formData.name);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.name, checkDuplicateName]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await submitForm(settings);
    if (result.success) {
      onSave();
      return;
    }

    if (result.duplicate && result.existingProduct) {
      const existing = result.existingProduct;
      const confirmed = await confirmDialog(
        dict.products?.duplicateProductTitle || 'Similar product already exists',
        (dict.products?.duplicateProductMessage ||
          'A product named "{name}" already exists (SKU: {sku}, stock: {stock}). Create a new, separate product anyway?')
          .replace('{name}', existing.name)
          .replace('{sku}', existing.sku || '-')
          .replace('{stock}', String(existing.stock)),
        { variant: 'warning' }
      );
      if (confirmed) {
        const retryResult = await submitForm(settings, true);
        if (retryResult.success) {
          onSave();
        }
      }
    }
  };

  const updateModifiers = (mods: NonNullable<typeof formData.modifiers>) => updateFormData({ modifiers: mods });
  const pickerMatches = pickerFiles.filter(f => f.name.toLowerCase().includes(pickerSearch.toLowerCase()));

  return (
    <>
      <Sheet
        wide
        title={product ? (dict.admin?.editProduct || 'Edit Product') : (dict.admin?.addProduct || 'Add Product')}
        onClose={onClose}
        closeLabel={closeLabel}
        footer={
          <>
            <button type="button" onClick={onClose} className={KEY}>
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button type="submit" form="product-form" disabled={saving} className={KEY_PRIMARY}>
              {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
            </button>
          </>
        }
      >
        {businessTypeConfig && (
          <div className="mb-4 border border-dashed border-ink/30 bg-paper px-3 py-2 font-receipt text-xs text-ink/70">
            <p>
              <span className="uppercase tracking-[0.08em] text-ink/50">{dict.products?.businessType || 'Business Type'}</span>{' '}
              <span className="font-semibold text-ink">{businessTypeConfig.name}</span>
            </p>
            {businessTypeConfig.requiredFields.length > 0 && (
              <p className="mt-1">
                <span className="uppercase tracking-[0.08em] text-ink/50">{dict.products?.requiredFields || 'Required fields'}</span>{' '}
                {businessTypeConfig.requiredFields.join(', ')}
              </p>
            )}
          </div>
        )}
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pm-name" className={LABEL}>{dict.admin?.name || 'Name'} *</label>
              <input
                id="pm-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => updateFormData({ name: e.target.value })}
                onBlur={(e) => checkDuplicateName(e.target.value)}
                aria-describedby="pm-name-hint"
                className={`${INPUT} ${nameDuplicate ? 'border-stamp focus:border-stamp focus:ring-stamp/30' : ''}`}
              />
              <div id="pm-name-hint" aria-live="polite">
                {checkingName && <p className={HINT}>{dict.products?.checkingDuplicate || 'Checking...'}</p>}
                {!checkingName && nameDuplicate && (
                  <p className="mt-1 border-l-2 border-stamp pl-2 font-receipt text-xs text-stamp">
                    {(dict.products?.duplicateProductInlineWarning ||
                      'A product named "{name}" already exists (SKU: {sku}, stock: {stock}).')
                      .replace('{name}', nameDuplicate.name)
                      .replace('{sku}', nameDuplicate.sku || '-')
                      .replace('{stock}', String(nameDuplicate.stock))}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="pm-sku" className={LABEL}>
                SKU {businessTypeConfig?.requiredFields?.includes('sku') && <span className="text-stamp">*</span>}
              </label>
              <input
                id="pm-sku"
                type="text"
                required={businessTypeConfig?.requiredFields?.includes('sku')}
                value={formData.sku}
                onChange={(e) => updateFormData({ sku: e.target.value })}
                className={`${INPUT} font-receipt`}
              />
            </div>
          </div>
          <div>
            <label htmlFor="pm-barcode" className={LABEL}>{dict.products?.barcode || 'Barcode'}</label>
            <div className="flex gap-2">
              <input
                id="pm-barcode"
                type="text"
                value={formData.barcode}
                onChange={(e) => updateFormData({ barcode: e.target.value })}
                className={`${INPUT_BASE} min-w-0 flex-1 font-receipt`}
                placeholder={dict.products?.scanOrEnterBarcode || 'Scan or enter barcode'}
              />
              <button
                type="button"
                onClick={() => updateFormData({ barcode: generateEAN13Helper() })}
                className={`${KEY} shrink-0`}
                title={dict.products?.generateEan13Title || 'Generate EAN-13 barcode'}
              >
                <RefreshCw className={ICON} strokeWidth={1.75} aria-hidden />
                {dict.products?.generate || 'Generate'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="pm-description" className={LABEL}>{dict.admin?.description || 'Description'}</label>
            <textarea
              id="pm-description"
              value={formData.description}
              onChange={(e) => updateFormData({ description: e.target.value })}
              rows={3}
              className={INPUT}
            />
          </div>
          <div>
            <p className={LABEL}>{dict.products?.productImage || 'Product Image'}</p>
            <div className="flex items-start gap-3">
              {formData.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={formData.image}
                  alt=""
                  className="h-20 w-20 flex-shrink-0 border border-ink/15 object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <label className={`${KEY} cursor-pointer`}>
                    <Upload className={ICON} strokeWidth={1.75} aria-hidden />
                    {dict.products?.upload || 'Upload'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          showToast.error(dict.products?.fileTooLarge || 'File too large. Maximum size: 10MB');
                          return;
                        }
                        try {
                          const fd = new FormData();
                          fd.append('file', file);
                          fd.append('type', 'products'); // Cloudinary folder 1pos/{slug}/products/
                          const res = await fetch('/api/upload', {
                            method: 'POST',
                            credentials: 'include',
                            body: fd,
                          });
                          const data = await res.json();
                          if (data.success) {
                            updateFormData({ image: data.data.url });
                          } else {
                            showToast.error(data.error || dict.products?.failedToUploadImage || 'Failed to upload image');
                          }
                        } catch {
                          showToast.error(dict.products?.uploadFailed || 'Upload failed');
                        }
                      }}
                    />
                  </label>
                  <button type="button" onClick={openImagePicker} className={KEY}>
                    {dict.products?.browse || 'Browse'}
                  </button>
                  {formData.image && (
                    <button type="button" onClick={() => updateFormData({ image: '' })} className={`${KEY} border-transparent text-stamp hover:bg-stamp/10`}>
                      {dict.products?.removeImage || 'Remove image'}
                    </button>
                  )}
                </div>
                <input
                  type="url"
                  value={formData.image.startsWith('data:') ? '' : formData.image}
                  onChange={(e) => updateFormData({ image: e.target.value })}
                  placeholder={dict.products?.pasteImageUrl || 'Or paste image URL (https://...)'}
                  aria-label={dict.products?.pasteImageUrl || 'Image URL'}
                  className={INPUT}
                />
              </div>
            </div>
          </div>
          <div className={`grid grid-cols-1 gap-4 ${showInventory ? 'sm:grid-cols-3' : ''}`}>
            <div>
              <label htmlFor="pm-price" className={LABEL}>{dict.admin?.price || 'Price'} *</label>
              <input
                id="pm-price"
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={(e) => updateFormData({ price: parseFloat(e.target.value) || 0 })}
                className={`${INPUT} font-receipt`}
              />
            </div>
            {showInventory && (
              <div>
                <label htmlFor="pm-stock" className={LABEL}>{dict.admin?.stock || 'Stock'}</label>
                <input
                  id="pm-stock"
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => updateFormData({ stock: parseInt(e.target.value) || 0 })}
                  className={`${INPUT} font-receipt`}
                  disabled={!formData.trackInventory || product?.hasVariations}
                />
                {product?.hasVariations && (
                  <p className={HINT}>{dict.products?.restockUseRefill || 'Has variations. Use Refill on the Products page.'}</p>
                )}
              </div>
            )}
            {showInventory && (
              <div>
                <label htmlFor="pm-threshold" className={LABEL}>{dict.admin?.lowStockThreshold || 'Low Stock Threshold'}</label>
                <input
                  id="pm-threshold"
                  type="number"
                  min="0"
                  value={formData.lowStockThreshold}
                  onChange={(e) => updateFormData({ lowStockThreshold: parseInt(e.target.value) || 10 })}
                  className={`${INPUT} font-receipt`}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="pm-category" className={LABEL}>{dict.admin?.category || 'Category'}</label>
              <CategoryPicker
                inputId="pm-category"
                inputRef={categoryInputRef}
                listRef={categoryListRef}
                value={categorySearch}
                selectedId={formData.categoryId}
                options={filteredCategories}
                open={showCategorySuggestions}
                onType={(value) => {
                  setCategorySearch(value);
                  setShowCategorySuggestions(true);
                  // Clear categoryId if search doesn't match any category
                  const matchingCategory = categories.find(
                    cat => cat.name.toLowerCase() === value.toLowerCase()
                  );
                  updateFormData({ categoryId: matchingCategory ? matchingCategory._id : '' });
                }}
                onFocus={() => setShowCategorySuggestions(true)}
                onPick={handleCategorySelect}
                placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                emptyLabel={dict.admin?.noCategoryFound || 'No category found'}
              />
            </div>
            <div>
              <label htmlFor="pm-type" className={LABEL}>
                {dict.common?.type || 'Type'} {businessTypeConfig && `(${businessTypeConfig.name})`}
              </label>
              <select
                id="pm-type"
                value={formData.productType}
                onChange={(e) => updateFormData({ productType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                className={INPUT}
              >
                {businessTypeConfig?.productTypes?.map((type: string) => (
                  <option key={type} value={type}>{productTypeLabel(dict, type)}</option>
                )) || (
                  <>
                    <option value="regular">{dict.admin?.regular || 'Regular'}</option>
                    <option value="bundle">{dict.admin?.bundle || 'Bundle'}</option>
                    <option value="service">{dict.admin?.service || 'Service'}</option>
                  </>
                )}
              </select>
              {businessTypeConfig && businessTypeConfig.productTypes.length === 1 && (
                <p className={HINT}>
                  {(dict.products?.onlyProductType || 'Only {type} products are allowed for {businessType}')
                    .replace('{type}', productTypeLabel(dict, businessTypeConfig.productTypes[0]))
                    .replace('{businessType}', businessTypeConfig.name)}
                </p>
              )}
            </div>
          </div>
          {showInventory && (
            <label className={CHECK_ROW}>
              <input
                type="checkbox"
                checked={formData.trackInventory}
                onChange={(e) => updateFormData({ trackInventory: e.target.checked })}
                className={CHECKBOX}
              />
              <span className="font-medium">{dict.admin?.trackInventory || 'Track Inventory'}</span>
            </label>
          )}

          {/* Restaurant-specific fields */}
          {settings?.businessType?.toLowerCase() === 'restaurant' && (
            <div className="space-y-4 border-t border-dashed border-ink/30 pt-4">
              <h3 className="font-semibold">{dict.products?.restaurantInfo || 'Restaurant Information'}</h3>

              <div>
                <label htmlFor="pm-allergens" className={LABEL}>{dict.products?.allergens || 'Allergens (comma-separated)'}</label>
                <input
                  id="pm-allergens"
                  type="text"
                  value={Array.isArray(formData.allergens) ? formData.allergens.join(', ') : formData.allergens || ''}
                  onChange={(e) => {
                    const allergens = e.target.value.split(',').map(a => a.trim()).filter(a => a);
                    updateFormData({ allergens });
                  }}
                  className={INPUT}
                  placeholder={dict.products?.allergensPlaceholder || 'e.g., gluten, dairy, nuts'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pm-calories" className={LABEL}>{dict.products?.calories || 'Calories'}</label>
                  <input
                    id="pm-calories"
                    type="number"
                    min="0"
                    value={formData.nutritionInfo?.calories || ''}
                    onChange={(e) => updateFormData({
                      ...formData,
                      nutritionInfo: { ...formData.nutritionInfo, calories: parseInt(e.target.value) || undefined }
                    })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="pm-protein" className={LABEL}>{dict.products?.protein || 'Protein (g)'}</label>
                  <input
                    id="pm-protein"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionInfo?.protein || ''}
                    onChange={(e) => updateFormData({
                      ...formData,
                      nutritionInfo: { ...formData.nutritionInfo, protein: parseFloat(e.target.value) || undefined }
                    })}
                    className={INPUT}
                  />
                </div>
              </div>

              {/* Modifier Groups */}
              <div className="pt-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`${LABEL} mb-0`}>{dict.products?.modifierGroups || 'Modifier Groups'}</p>
                  <button
                    type="button"
                    onClick={() => updateModifiers([
                      ...(formData.modifiers || []),
                      { name: '', options: [{ name: '', price: 0 }], required: false },
                    ])}
                    className={KEY}
                  >
                    {dict.products?.addGroup || '+ Add Group'}
                  </button>
                </div>
                <div className="space-y-3">
                  {(formData.modifiers || []).map((group, gi) => (
                    <div key={gi} className="space-y-2 border border-dashed border-ink/30 bg-paper p-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={group.name}
                          onChange={(e) => {
                            const mods = [...(formData.modifiers || [])];
                            mods[gi] = { ...mods[gi], name: e.target.value };
                            updateModifiers(mods);
                          }}
                          placeholder={dict.products?.modifierGroupPlaceholder || 'Group name (e.g. Temperature)'}
                          aria-label={dict.products?.modifierGroups || 'Modifier group name'}
                          className={`${INPUT_BASE} min-w-0 flex-1`}
                        />
                        <label className={`${CHECK_ROW} shrink-0 font-receipt text-xs uppercase`}>
                          <input
                            type="checkbox"
                            checked={group.required}
                            onChange={(e) => {
                              const mods = [...(formData.modifiers || [])];
                              mods[gi] = { ...mods[gi], required: e.target.checked };
                              updateModifiers(mods);
                            }}
                            className={CHECKBOX}
                          />
                          {dict.products?.required || 'Required'}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const mods = [...(formData.modifiers || [])];
                            mods.splice(gi, 1);
                            updateModifiers(mods);
                          }}
                          className={`${ROW_KEY} hover:text-stamp`}
                          title={dict.products?.removeModifierGroup || 'Remove group'}
                          aria-label={dict.products?.removeModifierGroup || 'Remove group'}
                        >
                          <X className={ICON} strokeWidth={1.75} aria-hidden />
                        </button>
                      </div>
                      {/* Options */}
                      <div className="space-y-1.5 pl-2">
                        {group.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt.name}
                              onChange={(e) => {
                                const mods = [...(formData.modifiers || [])];
                                const opts = [...mods[gi].options];
                                opts[oi] = { ...opts[oi], name: e.target.value };
                                mods[gi] = { ...mods[gi], options: opts };
                                updateModifiers(mods);
                              }}
                              placeholder={dict.products?.modifierOptionPlaceholder || 'Option (e.g. Rare)'}
                              aria-label={dict.products?.modifierOptionName || 'Option name'}
                              className={`${INPUT_BASE} min-w-0 flex-1`}
                            />
                            <span className="flex-shrink-0 font-receipt text-xs text-ink/50">+{currencySymbol}</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={opt.price || ''}
                              onChange={(e) => {
                                const mods = [...(formData.modifiers || [])];
                                const opts = [...mods[gi].options];
                                opts[oi] = { ...opts[oi], price: parseFloat(e.target.value) || 0 };
                                mods[gi] = { ...mods[gi], options: opts };
                                updateModifiers(mods);
                              }}
                              placeholder="0.00"
                              aria-label={dict.products?.modifierOptionPrice || 'Option price'}
                              className={`${INPUT_BASE} w-24 font-receipt`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const mods = [...(formData.modifiers || [])];
                                const opts = [...mods[gi].options];
                                opts.splice(oi, 1);
                                mods[gi] = { ...mods[gi], options: opts };
                                updateModifiers(mods);
                              }}
                              className={`${ROW_KEY} hover:text-stamp`}
                              title={dict.products?.removeModifierOption || 'Remove option'}
                              aria-label={dict.products?.removeModifierOption || 'Remove option'}
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const mods = [...(formData.modifiers || [])];
                            mods[gi] = { ...mods[gi], options: [...mods[gi].options, { name: '', price: 0 }] };
                            updateModifiers(mods);
                          }}
                          className="flex min-h-[44px] items-center font-receipt text-xs font-medium uppercase text-brand-hover hover:underline"
                        >
                          {dict.products?.addOption || '+ Add option'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Laundry-specific fields */}
          {settings?.businessType?.toLowerCase() === 'laundry' && (
            <div className="space-y-4 border-t border-dashed border-ink/30 pt-4">
              <h3 className="font-semibold">{dict.products?.laundryInfo || 'Laundry Service Information'}</h3>

              <div>
                <label htmlFor="pm-service-type" className={LABEL}>{dict.products?.serviceType || 'Service Type'}</label>
                <select
                  id="pm-service-type"
                  value={formData.serviceType}
                  onChange={(e) => updateFormData({ serviceType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                  className={INPUT}
                >
                  <option value="wash">{dict.products?.serviceTypeWash || 'Wash'}</option>
                  <option value="dry-clean">{dict.products?.serviceTypeDryClean || 'Dry Clean'}</option>
                  <option value="press">{dict.products?.serviceTypePress || 'Press'}</option>
                  <option value="repair">{dict.products?.serviceTypeRepair || 'Repair'}</option>
                  <option value="other">{dict.products?.serviceTypeOther || 'Other'}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={formData.weightBased}
                    onChange={(e) => updateFormData({ weightBased: e.target.checked })}
                    className={CHECKBOX}
                  />
                  <span className="font-medium">{dict.products?.weightBased || 'Weight-based pricing'}</span>
                </label>
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={formData.pickupDelivery}
                    onChange={(e) => updateFormData({ pickupDelivery: e.target.checked })}
                    className={CHECKBOX}
                  />
                  <span className="font-medium">{dict.products?.pickupDelivery || 'Pickup & Delivery'}</span>
                </label>
              </div>

              <div>
                <label htmlFor="pm-duration" className={LABEL}>{dict.products?.estimatedDuration || 'Estimated Duration (minutes)'}</label>
                <input
                  id="pm-duration"
                  type="number"
                  min="0"
                  value={formData.estimatedDuration || ''}
                  onChange={(e) => updateFormData({ estimatedDuration: parseInt(e.target.value) || undefined })}
                  className={INPUT}
                />
              </div>
            </div>
          )}

          {/* Service-specific fields */}
          {settings?.businessType?.toLowerCase() === 'service' && (
            <div className="space-y-4 border-t border-dashed border-ink/30 pt-4">
              <h3 className="font-semibold">{dict.products?.serviceInfo || 'Service Information'}</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pm-service-duration" className={LABEL}>{dict.products?.serviceDuration || 'Service Duration (minutes)'}</label>
                  <input
                    id="pm-service-duration"
                    type="number"
                    min="0"
                    value={formData.serviceDuration || ''}
                    onChange={(e) => updateFormData({ serviceDuration: parseInt(e.target.value) || undefined })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label htmlFor="pm-staff" className={LABEL}>{dict.products?.staffRequired || 'Staff Required'}</label>
                  <input
                    id="pm-staff"
                    type="number"
                    min="1"
                    value={formData.staffRequired || 1}
                    onChange={(e) => updateFormData({ staffRequired: parseInt(e.target.value) || 1 })}
                    className={INPUT}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pm-equipment" className={LABEL}>{dict.products?.equipmentRequired || 'Equipment Required (comma-separated)'}</label>
                <input
                  id="pm-equipment"
                  type="text"
                  value={Array.isArray(formData.equipmentRequired) ? formData.equipmentRequired.join(', ') : formData.equipmentRequired || ''}
                  onChange={(e) => {
                    const equipment = e.target.value.split(',').map(e => e.trim()).filter(e => e);
                    updateFormData({ equipmentRequired: equipment });
                  }}
                  className={INPUT}
                  placeholder={dict.products?.equipmentPlaceholder || 'e.g., scissors, clippers, styling chair'}
                />
              </div>
            </div>
          )}
          {error && <Strip tone="error">{error}</Strip>}
        </form>
      </Sheet>

      {/* Image Picker */}
      {showImagePicker && (
        <Sheet
          wide
          layer="z-[60]"
          title={dict.products?.selectImage || 'Select Image'}
          onClose={() => setShowImagePicker(false)}
          closeLabel={closeLabel}
          footer={
            <button type="button" onClick={() => setShowImagePicker(false)} className={KEY}>
              {dict.common?.cancel || 'Cancel'}
            </button>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder={dict.products?.searchImages || 'Search images...'}
              aria-label={dict.products?.searchImages || 'Search images'}
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className={`${INPUT_BASE} min-w-0 flex-1`}
            />
            <label className={`${KEY_PRIMARY} cursor-pointer ${pickerUploading ? 'cursor-not-allowed opacity-50' : ''}`}>
              <Upload className={ICON} strokeWidth={1.75} aria-hidden />
              {pickerUploading ? (dict.products?.uploading || 'Uploading...') : (dict.products?.uploadNew || 'Upload New')}
              <input
                ref={pickerFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={pickerUploading}
                onChange={handlePickerUpload}
              />
            </label>
          </div>
          {pickerLoading ? (
            <LoadingSpinner size="sm" className="py-12" />
          ) : pickerMatches.length === 0 ? (
            <p className="py-12 text-center font-receipt text-sm text-ink/60">
              {pickerSearch ? (dict.products?.noImagesMatch || 'No images match your search.') : (dict.products?.noImagesUploaded || 'No images uploaded yet. Upload one above.')}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pickerMatches.map(file => {
                const chosen = formData.image === file.url;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => {
                      updateFormData({ image: file.url });
                      setShowImagePicker(false);
                    }}
                    aria-pressed={chosen}
                    title={file.name}
                    className={`group relative aspect-square overflow-hidden border-2 bg-ink/5 ${chosen ? 'border-ink' : 'border-transparent hover:border-ink/40'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.url} alt={file.name} loading="lazy" className="h-full w-full object-cover" />
                    {chosen && (
                      <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center bg-ink text-[#7df0d6]">
                        <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-ink/80 px-1 py-0.5 font-receipt text-[11px] text-paper-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {file.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Sheet>
      )}
      {DuplicateDialog}
    </>
  );
}

function BulkRestockModal({
  products,
  dict,
  onClose,
  onSave,
}: {
  products: Product[];
  dict: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  onClose: () => void;
  onSave: (items: Array<{ productId: string; quantity: number }>) => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setQuantity = (productId: string, value: string) => {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const items = products
      .filter((p) => !p.hasVariations)
      .map((p) => {
        const raw = quantities[p._id];
        const quantity = raw ? parseInt(raw, 10) : 0;
        return { productId: p._id, quantity };
      })
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      setError(dict.products?.restockEnterQuantity || 'Enter a quantity for at least one product');
      return;
    }

    setSaving(true);
    try {
      await onSave(items);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      wide
      title={dict.products?.restockSelected || 'Restock Selected'}
      subtitle={(dict.products?.restockDescription ||
        'Enter the quantity received for each product ({count} selected). Leave blank to skip a product.').replace('{count}', String(products.length))}
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY} disabled={saving}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="restock-form" className={KEY_PRIMARY} disabled={saving}>
            {saving ? (dict.common?.saving || 'Saving...') : (dict.products?.restockConfirm || 'Restock')}
          </button>
        </>
      }
    >
      <form id="restock-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Strip tone="error">{error}</Strip>}
        <ul className="divide-y divide-dashed divide-ink/20 border-y border-dashed border-ink/30">
          {products.map((product) => (
            <li key={product._id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="font-receipt text-xs text-ink/60">
                  {product.sku || '-'} · {dict.admin?.stock || 'Stock'}: {product.trackInventory ? productStockTotal(product) : '∞'}
                </p>
              </div>
              {product.hasVariations ? (
                <span className="max-w-[12rem] shrink-0 text-right font-receipt text-xs text-ink/60">
                  {dict.products?.restockUseRefill || 'Has variations. Use Refill on the Products page.'}
                </span>
              ) : (
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={quantities[product._id] || ''}
                  onChange={(e) => setQuantity(product._id, e.target.value)}
                  aria-label={`${dict.products?.restockConfirm || 'Restock'}: ${product.name}`}
                  className={`${INPUT_BASE} w-24 text-right font-receipt`}
                />
              )}
            </li>
          ))}
        </ul>
      </form>
    </Sheet>
  );
}

function BulkEditModal({
  categories,
  dict,
  count,
  businessTypeConfig,
  onClose,
  onSave,
}: {
  categories: Category[];
  dict: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  count: number;
  businessTypeConfig: { defaultFeatures?: { enableInventory?: boolean } } | null;
  onClose: () => void;
  onSave: (updates: BulkProductUpdates) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [applyCategory, setApplyCategory] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

  const [applyPrice, setApplyPrice] = useState(false);
  const [priceMode, setPriceMode] = useState<'set' | 'percent' | 'add'>('set');
  const [priceValue, setPriceValue] = useState('');

  const [applyStock, setApplyStock] = useState(false);
  const [stockMode, setStockMode] = useState<'set' | 'add'>('set');
  const [stockValue, setStockValue] = useState('');

  const [applyTrackInventory, setApplyTrackInventory] = useState(false);
  const [trackInventory, setTrackInventory] = useState(true);

  const [applyLowStockThreshold, setApplyLowStockThreshold] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState('10');

  const showInventory = businessTypeConfig?.defaultFeatures?.enableInventory !== false;
  const applyLabel = dict.products?.applyField || 'Apply';
  const needsValue = (field: string) => `${field}: ${dict.products?.valueRequired || 'enter a value'}`;

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch, categories]);

  const handleCategorySelect = (category: Category) => {
    setCategoryId(category._id);
    setCategorySearch(category.name);
    setShowCategorySuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryInputRef.current &&
        categoryListRef.current &&
        !categoryInputRef.current.contains(event.target as Node) &&
        !categoryListRef.current.contains(event.target as Node)
      ) {
        setShowCategorySuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const updates: BulkProductUpdates = {};

    if (applyCategory) {
      if (!categoryId) {
        setError(dict.admin?.noCategoryFound || 'Please select a category');
        return;
      }
      updates.categoryId = categoryId;
    }

    if (applyPrice) {
      const value = parseFloat(priceValue);
      if (isNaN(value)) {
        setError(needsValue(dict.admin?.price || 'Price'));
        return;
      }
      updates.price = { mode: priceMode, value };
    }

    if (applyStock && showInventory) {
      const value = parseInt(stockValue, 10);
      if (isNaN(value)) {
        setError(needsValue(dict.admin?.stock || 'Stock'));
        return;
      }
      updates.stock = { mode: stockMode, value };
    }

    if (applyTrackInventory && showInventory) {
      updates.trackInventory = trackInventory;
    }

    if (applyLowStockThreshold && showInventory) {
      const value = parseInt(lowStockThreshold, 10);
      if (isNaN(value) || value < 0) {
        setError(needsValue(dict.admin?.lowStockThreshold || 'Low Stock Threshold'));
        return;
      }
      updates.lowStockThreshold = value;
    }

    if (Object.keys(updates).length === 0) {
      setError(dict.products?.bulkEditSubtitle || 'Select at least one field to apply');
      return;
    }

    setSaving(true);
    try {
      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  /** One line of the form: tick it to apply, then fill in the value. */
  const Field = ({ checked, onToggle, label, children }: { checked: boolean; onToggle: (v: boolean) => void; label: string; children?: ReactNode }) => (
    <div className="py-1">
      <label className={`${CHECK_ROW} font-medium`}>
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} className={CHECKBOX} />
        {applyLabel} {label}
      </label>
      {checked && children && <div className="pb-2 pl-6">{children}</div>}
    </div>
  );

  return (
    <Sheet
      title={dict.products?.bulkEditTitle || 'Bulk Edit Products'}
      subtitle={
        <>
          <span className="flex items-baseline gap-2 font-receipt text-xs font-semibold uppercase text-ink">
            <span className="font-led text-2xl leading-none">{count}</span>
            {dict.admin?.selected || 'selected'}
          </span>
          <span className="mt-1 block">{dict.products?.bulkEditSubtitle || 'Only checked fields will be applied.'}</span>
        </>
      }
      onClose={onClose}
      closeLabel={dict.common?.close || 'Close'}
      footer={
        <>
          <button type="button" onClick={onClose} className={KEY}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" form="bulk-edit-form" disabled={saving} className={KEY_PRIMARY}>
            {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
          </button>
        </>
      }
    >
      <form id="bulk-edit-form" onSubmit={handleSubmit} className="divide-y divide-dashed divide-ink/20">
        {Field({
          checked: applyCategory,
          onToggle: setApplyCategory,
          label: dict.admin?.category || 'Category',
          children: (
            <CategoryPicker
              inputRef={categoryInputRef}
              listRef={categoryListRef}
              value={categorySearch}
              selectedId={categoryId}
              options={filteredCategories}
              open={showCategorySuggestions}
              onType={(value) => {
                setCategorySearch(value);
                setShowCategorySuggestions(true);
                const match = categories.find(
                  (cat) => cat.name.toLowerCase() === value.toLowerCase()
                );
                setCategoryId(match?._id || '');
              }}
              onFocus={() => setShowCategorySuggestions(true)}
              onPick={handleCategorySelect}
              placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
            />
          ),
        })}

        {Field({
          checked: applyPrice,
          onToggle: setApplyPrice,
          label: dict.admin?.price || 'Price',
          children: (
            <div className="flex gap-2">
              <select
                value={priceMode}
                onChange={(e) => setPriceMode(e.target.value as 'set' | 'percent' | 'add')}
                aria-label={dict.admin?.price || 'Price'}
                className={`${INPUT_BASE} w-auto`}
              >
                <option value="set">{dict.products?.priceModeSet || 'Set to'}</option>
                <option value="percent">{dict.products?.priceModePercent || 'Increase by %'}</option>
                <option value="add">{dict.products?.priceModeAdd || 'Add amount'}</option>
              </select>
              <input
                type="number"
                step={priceMode === 'set' ? '0.01' : '1'}
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
                aria-label={dict.admin?.price || 'Price'}
                className={`${INPUT_BASE} min-w-0 flex-1 font-receipt`}
                placeholder="0"
              />
            </div>
          ),
        })}

        {showInventory && (
          <>
            {Field({
              checked: applyStock,
              onToggle: setApplyStock,
              label: dict.admin?.stock || 'Stock',
              children: (
                <>
                  <div className="flex gap-2">
                    <select
                      value={stockMode}
                      onChange={(e) => setStockMode(e.target.value as 'set' | 'add')}
                      aria-label={dict.admin?.stock || 'Stock'}
                      className={`${INPUT_BASE} w-auto`}
                    >
                      <option value="set">{dict.products?.stockModeSet || 'Set to'}</option>
                      <option value="add">{dict.products?.stockModeAdd || 'Add'}</option>
                    </select>
                    <input
                      type="number"
                      step="1"
                      value={stockValue}
                      onChange={(e) => setStockValue(e.target.value)}
                      aria-label={dict.admin?.stock || 'Stock'}
                      className={`${INPUT_BASE} min-w-0 flex-1 font-receipt`}
                      placeholder="0"
                    />
                  </div>
                  <p className={HINT}>
                    {dict.products?.bulkStockSkipsVariations || 'Products with variations are skipped. Use Refill on the Products page.'}
                  </p>
                </>
              ),
            })}

            {Field({
              checked: applyTrackInventory,
              onToggle: setApplyTrackInventory,
              label: dict.admin?.trackInventory || 'Track Inventory',
              children: (
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className={CHECKBOX}
                  />
                  {dict.admin?.trackInventory || 'Track Inventory'}
                </label>
              ),
            })}

            {Field({
              checked: applyLowStockThreshold,
              onToggle: setApplyLowStockThreshold,
              label: dict.admin?.lowStockThreshold || 'Low Stock Threshold',
              children: (
                <input
                  type="number"
                  min="0"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                  aria-label={dict.admin?.lowStockThreshold || 'Low Stock Threshold'}
                  className={`${INPUT} font-receipt`}
                />
              ),
            })}
          </>
        )}

        {error && <div className="pt-3"><Strip tone="error">{error}</Strip></div>}
      </form>
    </Sheet>
  );
}
