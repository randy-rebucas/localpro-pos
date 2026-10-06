'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BarcodeModal = dynamic(() => import('@/components/BarcodeModal'), { ssr: false });
const ProductImportModal = dynamic(() => import('@/components/ProductImportModal'), { ssr: false });
const BulkBarcodeModal = dynamic(() => import('@/components/BulkBarcodeModal'), { ssr: false });
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import Win8Drawer from '@/components/admin/Win8Drawer';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getCurrencySymbol, getDefaultTenantSettings } from '@/lib/currency';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getBusinessTypeConfig, getAllowedProductTypes } from '@/lib/business-types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getBusinessType } from '@/lib/business-type-helpers';
import { usePermissions } from '@/hooks/usePermissions';
import { Barcode, Pencil, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useProductsList, type Product, type Category } from '@/hooks/useProductsList';
import { useProductsForm } from '@/hooks/useProductsForm';
import type { BulkProductUpdates } from '@/lib/validation';
import {
  getProductDeletedMessage,
  getProductDeleteErrorMessage,
  getDeleteProductConfirmTitle,
  getBulkProductUpdateConfirmMessage,
  getBulkProductUpdateSuccessMessage,
  generateEAN13 as generateEAN13Helper,
} from '@/lib/products-helpers';

const btnPrimary =
  'px-4 py-2 bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 transition-colors';
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 bg-white text-sm hover:bg-gray-100 disabled:opacity-50 transition-colors';
const btnSecondaryIcon = `${btnSecondary} inline-flex items-center gap-2`;
const btnDropdownItem =
  'block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50';
const btnRowIcon =
  'inline-flex items-center justify-center p-2.5 text-white hover:brightness-110 disabled:opacity-50 transition-[filter]';
const inputCls = 'w-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
const eyebrowCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide';

const TYPE_BADGE: Record<string, string> = {
  regular: 'bg-brand text-white',
  bundle: 'bg-win8-accent text-white',
  service: 'bg-win8-info text-white',
};

const SPINNER_SM = (
  <span className="win8-spinner win8-spinner-sm"><span /><span /><span /><span /><span /></span>
);

function CloseIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

/** Navy drawer header strip shared by every form drawer on this page. */
function DrawerHeader({ title, subtitle, onClose, closeLabel }: { title: string; subtitle?: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
      <div className="min-w-0">
        <h2 className="text-base font-semibold truncate">{title}</h2>
        {subtitle && <p className="text-xs text-white/70 mt-0.5">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} title={closeLabel} aria-label={closeLabel} className="text-white/70 hover:text-white">
        <CloseIcon />
      </button>
    </div>
  );
}

export default function ProductsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [dict, setDict] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [showProductForm, setShowProductForm] = useState(false);
  const [productFormKey, setProductFormKey] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [productFilter, setProductFilter] = useState<'missing-barcode' | 'all'>('missing-barcode');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkRestock, setShowBulkRestock] = useState(false);
  const [bulkFormKey, setBulkFormKey] = useState(0);
  const [showBulkBarcodeModal, setShowBulkBarcodeModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 20;
  const { settings } = useTenantSettings();
  const { confirm, Dialog } = useConfirm();
  const { canAccess } = usePermissions();
  const canCreate = canAccess('products.create');
  const canEdit = canAccess('products.edit');
  const canDelete = canAccess('products.delete');
  const canRestock = canAccess('products.restock');
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
  } = useProductsList(tenant);

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

  const openProductForm = (product: Product | null) => {
    setEditingProduct(product);
    setProductFormKey((k) => k + 1);
    setShowProductForm(true);
  };

  const openBulkEdit = () => {
    setBulkFormKey((k) => k + 1);
    setShowBulkEdit(true);
  };

  const openBulkRestock = () => {
    setBulkFormKey((k) => k + 1);
    setShowBulkRestock(true);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!dict) return;
    const confirmed = await confirm(
      getDeleteProductConfirmTitle(dict),
      (dict.products?.deleteProductNamed || 'Delete product "{name}"?').replace('{name}', product.name),
      { variant: 'danger' }
    );
    if (!confirmed) return;
    setBusyId(product._id);
    const result = await deleteProduct(product._id);
    setBusyId(null);
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
    setBusyId(productId);
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
    } finally {
      setBusyId(null);
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
      setShowBulkEdit(false);
      loadProducts();
    } else {
      showToast.error(result.error || dict.products?.bulkUpdateFailed || 'Failed to update products');
    }
  };

  const handleBulkRestockSave = async (items: Array<{ productId: string; quantity: number }>) => {
    if (items.length === 0 || !dict) return;
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
          showToast.success((dict.products?.restockSuccess || '{count} product(s) restocked').replace('{count}', String(result.restocked)));
        }
        setSelectedProducts(new Set());
        setShowBulkRestock(false);
        loadProducts();
      } else {
        showToast.error(result.error || dict.products?.restockFailed || 'Failed to restock products');
      }
    } catch {
      showToast.error(dict.products?.restockFailed || 'Failed to restock products');
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
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        const res = await fetch(`/api/products?${params}`, { credentials: 'include' });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch products');
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

  if (!dict) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="win8-spinner text-brand"><span /><span /><span /><span /><span /></div>
      </div>
    );
  }

  const typeLabel = (type: string) =>
    type === 'regular' ? (dict.admin?.regular || 'Regular')
      : type === 'bundle' ? (dict.admin?.bundle || 'Bundle')
      : type === 'service' ? (dict.admin?.service || 'Service')
      : type;

  const renderEmpty = () => {
    let text: string;
    if (productFilter === 'missing-barcode' && !debouncedSearch && statusFilter === 'active') {
      text = dict.products?.noMissingBarcode || 'Every active product has a barcode.';
    } else if (debouncedSearch || productFilter !== 'all' || statusFilter === 'inactive') {
      text = dict.products?.noProductsMatch || 'No products match your filters.';
    } else {
      text = dict.products?.noProductsYet || 'No products yet.';
    }
    return <div className="text-center py-12 text-gray-400 bg-white border border-gray-300">{text}</div>;
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
          <p className="mt-3 text-gray-400 text-sm">{dict.products?.loadingProducts || 'Loading products…'}</p>
        </div>
      );
    }

    if (message?.type === 'error') {
      return (
        <div className="text-center py-12 bg-white border border-gray-300">
          <p className="text-win8-danger text-sm font-medium">{message.text}</p>
          <button onClick={loadProducts} className="mt-4 px-4 py-2 bg-brand text-white text-sm hover:bg-brand-hover transition-colors">
            {dict.common?.retry || 'Retry'}
          </button>
        </div>
      );
    }

    if (products.length === 0) return renderEmpty();

    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
      <div className="border border-gray-300 bg-white">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-navy text-white text-xs uppercase tracking-wide sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={selectedProducts.size === products.length && products.length > 0}
                    onChange={handleSelectAll}
                    className="checkbox-win8"
                    aria-label={dict.common?.selectAll || 'Select all'}
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium">{dict.products?.imageHeader || 'Image'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.name || 'Name'}</th>
                <th className="px-4 py-3 text-left font-medium">SKU</th>
                <th className="px-4 py-3 text-left font-medium">{dict.admin?.category || 'Category'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.price || 'Price'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.admin?.stock || 'Stock'}</th>
                <th className="px-4 py-3 text-left font-medium">{dict.common?.type || 'Type'}</th>
                <th className="px-4 py-3 text-right font-medium">{dict.common?.actions || 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map((product) => {
                const selected = selectedProducts.has(product._id);
                const busy = busyId === product._id;
                const lowStock = product.trackInventory && product.stock < (product.lowStockThreshold || 10);
                const categoryName =
                  typeof product.categoryId === 'object' && product.categoryId?.name
                    ? product.categoryId.name
                    : product.category;
                return (
                  <tr key={product._id} className={`hover:bg-gray-100 transition-colors ${selected ? 'bg-brand-soft' : ''}`}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleSelectProduct(product._id)}
                        className="checkbox-win8"
                        aria-label={`${dict.common?.select || 'Select'} ${product.name}`}
                      />
                    </td>
                    <td className="px-4 py-3 w-14">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt={product.name} className="w-10 h-10 object-cover border border-gray-200" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 border border-gray-200 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.isActive === false && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-gray-500 text-white">
                            {dict.products?.statusInactive || 'Inactive'}
                          </span>
                        )}
                      </div>
                      {product.description && (
                        <p className="text-xs text-gray-500 mt-0.5 max-w-[240px] truncate" title={product.description}>
                          {product.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-mono text-xs text-gray-700">{product.sku || '—'}</p>
                      {product.barcode && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{product.barcode}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{categoryName || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-gray-900 tabular-nums">
                      <Currency amount={product.price} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                      <span className={lowStock ? 'font-semibold text-win8-danger' : 'text-gray-900'}>
                        {product.trackInventory ? product.stock.toLocaleString() : '∞'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[product.productType] || 'bg-gray-500 text-white'}`}>
                        {typeLabel(product.productType)}
                        {product.hasVariations && ` ${dict.products?.variations || '(variations)'}`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBarcodeProduct(product)}
                          className={`${btnRowIcon} bg-brand-navy`}
                          title={dict.products?.barcode || 'Barcode'}
                          aria-label={`${dict.products?.barcode || 'Barcode'}: ${product.name}`}
                        >
                          <Barcode className="w-4 h-4" aria-hidden />
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openProductForm(product)}
                            className={`${btnRowIcon} bg-brand`}
                            title={dict.common?.edit || 'Edit'}
                            aria-label={`${dict.common?.edit || 'Edit'} ${product.name}`}
                          >
                            <Pencil className="w-4 h-4" aria-hidden />
                          </button>
                        )}
                        {(product.isActive === false ? canEdit : canDelete) && (product.isActive === false ? (
                          <button
                            type="button"
                            onClick={() => handleReactivateProduct(product._id)}
                            disabled={busy}
                            className={`${btnRowIcon} bg-win8-success`}
                            title={dict.products?.reactivate || 'Reactivate'}
                            aria-label={`${dict.products?.reactivate || 'Reactivate'} ${product.name}`}
                          >
                            {busy ? SPINNER_SM : <RotateCcw className="w-4 h-4" aria-hidden />}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product)}
                            disabled={busy}
                            className={`${btnRowIcon} bg-win8-danger`}
                            title={dict.common?.delete || 'Delete'}
                            aria-label={`${dict.common?.delete || 'Delete'} ${product.name}`}
                          >
                            {busy ? SPINNER_SM : <Trash2 className="w-4 h-4" aria-hidden />}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="border-t border-gray-300 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span className="tabular-nums">
              {dict.admin?.showing || 'Showing'} {start}–{end} {dict.admin?.of || 'of'} {pagination.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                ← {dict.common?.previous || 'Prev'}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="px-3 py-1 border border-gray-300 bg-white disabled:opacity-40 hover:bg-gray-100"
              >
                {dict.common?.next || 'Next'} →
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    { value: 'missing-barcode', label: dict.products?.tabMissingBarcode || 'Missing Barcode' },
    { value: 'all', label: dict.products?.tabAllProducts || 'All Products' },
  ] as const;

  return (
    <>
      {Dialog}
      <div className="px-4 sm:px-6 py-6">
        <AdminPageHeader
          title={dict.admin?.products || 'Products'}
          description={dict.admin?.productsSubtitle || 'Manage products, variations, and bundles'}
        />

        <div className="space-y-4">
          <div className="bg-white border border-gray-300">
            <div className="flex border-b border-gray-300" role="tablist">
              {tabs.map((tab) => {
                const active = productFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setProductFilter(tab.value); setPage(1); }}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                      active ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                    {active && pagination.total > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-brand-navy text-white tabular-nums">
                        {pagination.total.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap p-3">
              <div className="flex gap-3 flex-wrap">
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
                  </svg>
                  <input
                    type="text"
                    placeholder={dict.common?.search || 'Search products…'}
                    aria-label={dict.common?.search || 'Search products'}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    className="pl-8 pr-3 py-2 border border-gray-300 text-sm w-56"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as 'active' | 'inactive' | 'all');
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-gray-300 text-sm bg-white text-gray-900"
                  aria-label={dict.products?.statusFilter || 'Status'}
                >
                  <option value="active">{dict.products?.statusActive || 'Active'}</option>
                  <option value="inactive">{dict.products?.statusInactive || 'Inactive'}</option>
                  <option value="all">{dict.products?.statusAll || 'All'}</option>
                </select>
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
                    {exporting
                      ? (dict.products?.exporting || 'Exporting…')
                      : `${dict.admin?.export || 'Export'} ▼`}
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
                {canCreate && (
                  <button type="button" onClick={() => setShowImportModal(true)} className={btnSecondaryIcon}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {dict.products?.import || 'Import'}
                  </button>
                )}
                {(canCreate || canEdit) && (
                  <Link href={`/${tenant}/${lang}/admin/file-upload`} className={btnSecondaryIcon}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    {dict.products?.uploadImages || 'Upload Images'}
                  </Link>
                )}
                {canCreate && (
                  <button type="button" onClick={() => openProductForm(null)} className={btnPrimary}>
                    + {dict.admin?.addProduct || 'Add Product'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {selectedProducts.size > 0 && (
            <div className="p-3 bg-brand-soft border border-brand flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-semibold text-brand-navy tabular-nums">
                {selectedProducts.size} {dict.admin?.selected || 'selected'}
              </span>
              <div className="flex gap-2 flex-wrap">
                {canEdit && (
                  <button type="button" onClick={openBulkEdit} className={btnPrimary}>
                    {dict.products?.bulkEdit || 'Edit Selected'}
                  </button>
                )}
                {canRestock && (
                  <button type="button" onClick={openBulkRestock} className={btnPrimary}>
                    {dict.products?.restockSelected || 'Restock Selected'}
                  </button>
                )}
                <button type="button" onClick={() => setShowBulkBarcodeModal(true)} className={btnSecondary}>
                  {dict.products?.printBarcodes || 'Print Barcodes'}
                </button>
                <button type="button" onClick={() => setSelectedProducts(new Set())} className={btnSecondary}>
                  {dict.common?.cancel || 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {renderBody()}
        </div>
      </div>

      <Win8Drawer open={showProductForm} onClose={() => setShowProductForm(false)} widthClass="max-w-2xl">
        <ProductForm
          key={productFormKey}
          product={editingProduct}
          categories={categories}
          onClose={() => setShowProductForm(false)}
          onSave={() => {
            showToast.success(
              editingProduct
                ? (dict.products?.productUpdated || 'Product updated')
                : (dict.products?.productCreated || 'Product created')
            );
            setShowProductForm(false);
            loadProducts();
          }}
          dict={dict}
          businessTypeConfig={businessTypeConfig}
          settings={settings}
        />
      </Win8Drawer>

      <Win8Drawer open={showBulkEdit} onClose={() => setShowBulkEdit(false)}>
        <BulkEditForm
          key={bulkFormKey}
          categories={categories}
          dict={dict}
          count={selectedProducts.size}
          businessTypeConfig={businessTypeConfig}
          onClose={() => setShowBulkEdit(false)}
          onSave={handleBulkEditSave}
        />
      </Win8Drawer>

      <Win8Drawer open={showBulkRestock} onClose={() => setShowBulkRestock(false)}>
        <BulkRestockForm
          key={bulkFormKey}
          products={products.filter((p) => selectedProducts.has(p._id))}
          dict={dict}
          onClose={() => setShowBulkRestock(false)}
          onSave={handleBulkRestockSave}
        />
      </Win8Drawer>

      {barcodeProduct && (
        <BarcodeModal
          value={barcodeProduct.barcode || barcodeProduct.sku || barcodeProduct._id}
          productName={barcodeProduct.name}
          onClose={() => setBarcodeProduct(null)}
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

      {showBulkBarcodeModal && (
        <BulkBarcodeModal
          products={products.filter((p) => selectedProducts.has(p._id))}
          dict={dict}
          onClose={() => setShowBulkBarcodeModal(false)}
        />
      )}
    </>
  );
}


function ProductForm({
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
  const [imageError, setImageError] = useState('');
  const currencySymbol = settings?.currencySymbol || getCurrencySymbol(settings?.currency || getDefaultTenantSettings().currency);
  const [imageUploading, setImageUploading] = useState(false);

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

  useEffect(() => {
    if (!showImagePicker) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowImagePicker(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showImagePicker]);

  const handlePickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickerUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (data.success) {
        updateFormData({ image: data.data.url });
        setShowImagePicker(false);
      }
    } catch {
      // silent
    } finally {
      setPickerUploading(false);
      if (pickerFileInputRef.current) pickerFileInputRef.current.value = '';
    }
  };

  // Initialize category search with current category name
  useEffect(() => {
    if (product?.categoryId) {
      const currentCategory = categories.find(
        cat => cat.id === (typeof product.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product.categoryId)
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
    updateFormData({ categoryId: category.id });
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

  return (
    <>
      <DrawerHeader
        title={product ? (dict.admin?.editProduct || 'Edit Product') : (dict.admin?.addProduct || 'Add Product')}
        onClose={onClose}
        closeLabel={dict.common?.close || 'Close'}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {businessTypeConfig && (
            <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
              <p>
                <strong>{dict.products?.businessType || 'Business Type'}:</strong> {businessTypeConfig.name}
              </p>
              <p className="text-xs mt-1">{businessTypeConfig.description}</p>
              {businessTypeConfig.requiredFields.length > 0 && (
                <p className="text-xs mt-1">
                  <strong>{dict.products?.requiredFields || 'Required fields'}:</strong> {businessTypeConfig.requiredFields.join(', ')}
                </p>
              )}
            </div>
          )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="product-name" className={labelCls}>
                  {dict.admin?.name || 'Name'} <span className="text-win8-danger">*</span>
                </label>
                <input
                  id="product-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  onBlur={(e) => checkDuplicateName(e.target.value)}
                  className={`w-full border px-3 py-2 text-sm bg-white ${
                    nameDuplicate ? 'border-win8-warning' : 'border-gray-300'
                  }`}
                />
                {checkingName && (
                  <p className="text-xs text-gray-400 mt-1">{dict.products?.checkingDuplicate || 'Checking…'}</p>
                )}
                {!checkingName && nameDuplicate && (
                  <p className="text-xs font-medium text-win8-warning mt-1">
                    {(dict.products?.duplicateProductInlineWarning ||
                      'A product named "{name}" already exists (SKU: {sku}, stock: {stock}).')
                      .replace('{name}', nameDuplicate.name)
                      .replace('{sku}', nameDuplicate.sku || '-')
                      .replace('{stock}', String(nameDuplicate.stock))}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="product-sku" className={labelCls}>
                  SKU {businessTypeConfig?.requiredFields?.includes('sku') && <span className="text-win8-danger">*</span>}
                </label>
                <input
                  id="product-sku"
                  type="text"
                  required={businessTypeConfig?.requiredFields?.includes('sku')}
                  value={formData.sku}
                  onChange={(e) => updateFormData({ sku: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>
                {dict.products?.barcode || 'Barcode'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => updateFormData({ barcode: e.target.value })}
                  className="flex-1 border border-gray-300 px-3 py-2 text-sm bg-white font-mono"
                  placeholder={dict.products?.scanOrEnterBarcode || 'Scan or enter barcode'}
                />
                <button
                  type="button"
                  onClick={() => updateFormData({ barcode: generateEAN13Helper() })}
                  className={`${btnSecondary} inline-flex items-center gap-1.5 whitespace-nowrap`}
                  title={dict.products?.generateEan13Title || 'Generate EAN-13 barcode'}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  {dict.products?.generate || 'Generate'}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                rows={3}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {dict.products?.productImage || 'Product Image'}
              </label>
              <div className="flex gap-3 items-start">
                {formData.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="w-20 h-20 object-cover border border-gray-200 flex-shrink-0"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <label className={`${btnSecondary} inline-flex items-center gap-2 cursor-pointer ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {imageUploading ? (dict.products?.uploading || 'Uploading…') : (dict.products?.upload || 'Upload')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        disabled={imageUploading}
                        onChange={async (e) => {
                          const input = e.target;
                          const file = input.files?.[0];
                          if (!file) return;
                          setImageError('');
                          if (file.size > 10 * 1024 * 1024) {
                            setImageError(dict.products?.fileTooLarge || 'File too large. Maximum size: 10MB');
                            input.value = '';
                            return;
                          }
                          setImageUploading(true);
                          try {
                            const fd = new FormData();
                            fd.append('file', file);
                            const res = await fetch('/api/upload', {
                              method: 'POST',
                              credentials: 'include',
                              body: fd,
                            });
                            const data = await res.json();
                            if (data.success) {
                              updateFormData({ image: data.data.url });
                            } else {
                              setImageError(data.error || dict.products?.failedToUploadImage || 'Failed to upload image');
                            }
                          } catch {
                            setImageError(dict.products?.uploadFailed || 'Upload failed');
                          } finally {
                            setImageUploading(false);
                            input.value = '';
                          }
                        }}
                      />
                    </label>
                    <button type="button" onClick={openImagePicker} className={btnSecondary}>
                      {dict.products?.browse || 'Browse'}
                    </button>
                  </div>
                  <input
                    type="url"
                    value={formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={(e) => updateFormData({ image: e.target.value })}
                    placeholder={dict.products?.pasteImageUrl || 'Or paste image URL (https://...)'}
                    aria-label={dict.products?.pasteImageUrl || 'Image URL'}
                    className={inputCls}
                  />
                  {formData.image && (
                    <button
                      type="button"
                      onClick={() => updateFormData({ image: '' })}
                      className="text-xs text-win8-danger hover:underline"
                    >
                      {dict.products?.removeImage || 'Remove image'}
                    </button>
                  )}
                  {imageError && (
                    <p className="p-3 bg-white border border-win8-danger text-win8-danger text-sm">{imageError}</p>
                  )}
                </div>
              </div>
            </div>
            <div className={`grid gap-3 ${businessTypeConfig?.defaultFeatures?.enableInventory !== false ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
              <div>
                <label className={labelCls}>
                  {dict.admin?.price || 'Price'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => updateFormData({ price: parseFloat(e.target.value) || 0 })}
                  className={inputCls}
                />
              </div>
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
                <div>
                  <label className={labelCls}>
                    {dict.admin?.stock || 'Stock'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => updateFormData({ stock: parseInt(e.target.value) || 0 })}
                    className={inputCls}
                    disabled={!formData.trackInventory}
                  />
                </div>
              )}
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
                <div>
                  <label className={labelCls}>
                    {dict.admin?.lowStockThreshold || 'Low Stock Threshold'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lowStockThreshold}
                    onChange={(e) => updateFormData({ lowStockThreshold: parseInt(e.target.value) || 10 })}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <label className={labelCls}>
                  {dict.admin?.category || 'Category'}
                </label>
                <div ref={categoryInputRef} className="relative">
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCategorySearch(value);
                      setShowCategorySuggestions(true);
                      // Clear categoryId if search doesn't match any category
                      const matchingCategory = categories.find(
                        cat => cat.name.toLowerCase() === value.toLowerCase()
                      );
                      if (matchingCategory) {
                        updateFormData({ categoryId: matchingCategory.id });
                      } else {
                        updateFormData({ categoryId: '' });
                      }
                    }}
                    onFocus={() => setShowCategorySuggestions(true)}
                    placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                    className={inputCls}
                  />
                  {showCategorySuggestions && filteredCategories.length > 0 && (
                    <div
                      ref={categoryListRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 max-h-60 overflow-y-auto"
                    >
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleCategorySelect(cat)}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                            formData.categoryId === cat.id ? 'bg-brand-soft font-medium text-brand-navy' : 'text-gray-700'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {showCategorySuggestions && categorySearch && filteredCategories.length === 0 && (
                    <div
                      ref={categoryListRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 p-4 text-sm text-gray-500"
                    >
                      {dict.admin?.noCategoryFound || 'No category found'}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  {dict.common?.type || 'Type'} {businessTypeConfig && `(${businessTypeConfig.name})`}
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => updateFormData({ productType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                  className={inputCls}
                >
                  {businessTypeConfig?.productTypes?.map((type: string) => (
                    <option key={type} value={type}>
                      {type === 'regular' ? (dict.admin?.regular || 'Regular') : 
                       type === 'bundle' ? (dict.admin?.bundle || 'Bundle') : 
                       (dict.admin?.service || 'Service')}
                    </option>
                  )) || (
                    <>
                      <option value="regular">{dict.admin?.regular || 'Regular'}</option>
                      <option value="bundle">{dict.admin?.bundle || 'Bundle'}</option>
                      <option value="service">{dict.admin?.service || 'Service'}</option>
                    </>
                  )}
                </select>
                {businessTypeConfig && businessTypeConfig.productTypes.length === 1 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {(dict.products?.onlyProductType || 'Only {type} products are allowed for {businessType}')
                      .replace('{type}', businessTypeConfig.productTypes[0])
                      .replace('{businessType}', businessTypeConfig.name)}
                  </p>
                )}
              </div>
            </div>
            {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.trackInventory}
                    onChange={(e) => updateFormData({ trackInventory: e.target.checked })}
                    className="checkbox-win8"
                  />
                  {dict.admin?.trackInventory || 'Track Inventory'}
                </label>
              </div>
            )}

            {/* Restaurant-specific fields */}
            {settings?.businessType?.toLowerCase() === 'restaurant' && (
              <div className="space-y-4 pt-4 border-t border-gray-300">
                <h3 className={eyebrowCls}>{dict.products?.restaurantInfo || 'Restaurant Information'}</h3>

                <div>
                  <label className={labelCls}>{dict.products?.allergens || 'Allergens (comma-separated)'}</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.allergens) ? formData.allergens.join(', ') : formData.allergens || ''}
                    onChange={(e) => {
                      const allergens = e.target.value.split(',').map(a => a.trim()).filter(a => a);
                      updateFormData({ allergens });
                    }}
                    className={inputCls}
                    placeholder={dict.products?.allergensPlaceholder || 'e.g., gluten, dairy, nuts'}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{dict.products?.calories || 'Calories'}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.nutritionInfo?.calories || ''}
                      onChange={(e) => updateFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, calories: parseInt(e.target.value) || undefined }
                      })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{dict.products?.protein || 'Protein (g)'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.nutritionInfo?.protein || ''}
                      onChange={(e) => updateFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, protein: parseFloat(e.target.value) || undefined }
                      })}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Modifier Groups */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600">{dict.products?.modifierGroups || 'Modifier Groups'}</p>
                    <button
                      type="button"
                      onClick={() => updateFormData({
                        modifiers: [
                          ...(formData.modifiers || []),
                          { name: '', options: [{ name: '', price: 0 }], required: false },
                        ],
                      })}
                      className="px-3 py-1 text-xs font-semibold bg-brand text-white hover:brightness-110 transition-[filter]"
                    >
                      {dict.products?.addGroup || '+ Add Group'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(formData.modifiers || []).map((group, gi) => (
                      <div key={gi} className="border border-gray-300 p-3 bg-gray-50 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => {
                              const mods = [...(formData.modifiers || [])];
                              mods[gi] = { ...mods[gi], name: e.target.value };
                              updateFormData({ modifiers: mods });
                            }}
                            placeholder={dict.products?.modifierGroupPlaceholder || 'Group name (e.g. Temperature)'}
                            aria-label={dict.products?.modifierGroupName || 'Modifier group name'}
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 bg-white"
                          />
                          <label className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={group.required}
                              onChange={(e) => {
                                const mods = [...(formData.modifiers || [])];
                                mods[gi] = { ...mods[gi], required: e.target.checked };
                                updateFormData({ modifiers: mods });
                              }}
                              className="checkbox-win8"
                            />
                            {dict.products?.required || 'Required'}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const mods = [...(formData.modifiers || [])];
                              mods.splice(gi, 1);
                              updateFormData({ modifiers: mods });
                            }}
                            className="inline-flex items-center justify-center p-2 text-white bg-win8-danger hover:brightness-110 transition-[filter]"
                            title={dict.products?.removeModifierGroup || 'Remove group'}
                            aria-label={dict.products?.removeModifierGroup || 'Remove group'}
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Options */}
                        <div className="pl-2 space-y-1.5">
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
                                  updateFormData({ modifiers: mods });
                                }}
                                placeholder={dict.products?.modifierOptionPlaceholder || 'Option (e.g. Rare)'}
                                aria-label={dict.products?.modifierOptionName || 'Option name'}
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 bg-white"
                              />
                              <span className="text-xs text-gray-400 flex-shrink-0">+{currencySymbol}</span>
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
                                  updateFormData({ modifiers: mods });
                                }}
                                placeholder="0.00"
                                aria-label={dict.products?.modifierOptionPrice || 'Option price'}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 bg-white tabular-nums"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const mods = [...(formData.modifiers || [])];
                                  const opts = [...mods[gi].options];
                                  opts.splice(oi, 1);
                                  mods[gi] = { ...mods[gi], options: opts };
                                  updateFormData({ modifiers: mods });
                                }}
                                className="inline-flex items-center justify-center p-2 text-win8-danger hover:bg-gray-100 transition-colors"
                                title={dict.products?.removeModifierOption || 'Remove option'}
                                aria-label={dict.products?.removeModifierOption || 'Remove option'}
                              >
                                <CloseIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const mods = [...(formData.modifiers || [])];
                              mods[gi] = { ...mods[gi], options: [...mods[gi].options, { name: '', price: 0 }] };
                              updateFormData({ modifiers: mods });
                            }}
                            className="text-xs text-brand hover:underline font-medium"
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
              <div className="space-y-4 pt-4 border-t border-gray-300">
                <h3 className={eyebrowCls}>{dict.products?.laundryInfo || 'Laundry Service Information'}</h3>

                <div>
                  <label className={labelCls}>{dict.products?.serviceType || 'Service Type'}</label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) => updateFormData({ serviceType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                    className={inputCls}
                  >
                    <option value="wash">{dict.products?.serviceTypeWash || 'Wash'}</option>
                    <option value="dry-clean">{dict.products?.serviceTypeDryClean || 'Dry Clean'}</option>
                    <option value="press">{dict.products?.serviceTypePress || 'Press'}</option>
                    <option value="repair">{dict.products?.serviceTypeRepair || 'Repair'}</option>
                    <option value="other">{dict.products?.serviceTypeOther || 'Other'}</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.weightBased}
                      onChange={(e) => updateFormData({ weightBased: e.target.checked })}
                      className="checkbox-win8"
                    />
                    {dict.products?.weightBased || 'Weight-based pricing'}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.pickupDelivery}
                      onChange={(e) => updateFormData({ pickupDelivery: e.target.checked })}
                      className="checkbox-win8"
                    />
                    {dict.products?.pickupDelivery || 'Pickup & Delivery'}
                  </label>
                </div>

                <div>
                  <label className={labelCls}>{dict.products?.estimatedDuration || 'Estimated Duration (minutes)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.estimatedDuration || ''}
                    onChange={(e) => updateFormData({ estimatedDuration: parseInt(e.target.value) || undefined })}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* Service-specific fields */}
            {settings?.businessType?.toLowerCase() === 'service' && (
              <div className="space-y-4 pt-4 border-t border-gray-300">
                <h3 className={eyebrowCls}>{dict.products?.serviceInfo || 'Service Information'}</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{dict.products?.serviceDuration || 'Service Duration (minutes)'}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.serviceDuration || ''}
                      onChange={(e) => updateFormData({ serviceDuration: parseInt(e.target.value) || undefined })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{dict.products?.staffRequired || 'Staff Required'}</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.staffRequired || 1}
                      onChange={(e) => updateFormData({ staffRequired: parseInt(e.target.value) || 1 })}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>{dict.products?.equipmentRequired || 'Equipment Required (comma-separated)'}</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.equipmentRequired) ? formData.equipmentRequired.join(', ') : formData.equipmentRequired || ''}
                    onChange={(e) => {
                      const equipment = e.target.value.split(',').map(e => e.trim()).filter(e => e);
                      updateFormData({ equipmentRequired: equipment });
                    }}
                    className={inputCls}
                    placeholder={dict.products?.equipmentPlaceholder || 'e.g., scissors, clippers, styling chair'}
                  />
                </div>
              </div>
            )}
            {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>

      {/* Image picker: portaled so the drawer's transformed panel doesn't trap `fixed` positioning */}
      {showImagePicker && createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={() => setShowImagePicker(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-picker-title"
            className="bg-white border border-gray-300 w-full max-w-2xl flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-brand-navy text-white shrink-0">
              <h3 id="image-picker-title" className="text-base font-semibold">{dict.products?.selectImage || 'Select Image'}</h3>
              <button
                type="button"
                onClick={() => setShowImagePicker(false)}
                title={dict.common?.close || 'Close'}
                aria-label={dict.common?.close || 'Close'}
                className="text-white/70 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-300">
              <input
                type="text"
                placeholder={dict.products?.searchImages || 'Search images…'}
                aria-label={dict.products?.searchImages || 'Search images'}
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 text-sm bg-white"
              />
              <label className={`${btnPrimary} cursor-pointer ${pickerUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {pickerUploading ? (dict.products?.uploading || 'Uploading…') : (dict.products?.uploadNew || 'Upload New')}
                <input
                  ref={pickerFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={pickerUploading}
                  onChange={handlePickerUpload}
                />
              </label>
            </div>
            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <div className="text-center py-12">
                  <div className="win8-spinner text-brand mx-auto"><span /><span /><span /><span /><span /></div>
                </div>
              ) : pickerFiles.filter(f => f.name.toLowerCase().includes(pickerSearch.toLowerCase())).length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {pickerSearch ? (dict.products?.noImagesMatch || 'No images match your search.') : (dict.products?.noImagesUploaded || 'No images uploaded yet. Upload one above.')}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {pickerFiles
                    .filter(f => f.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                    .map(file => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => {
                          updateFormData({ image: file.url });
                          setShowImagePicker(false);
                        }}
                        title={file.name}
                        aria-pressed={formData.image === file.url}
                        className={`relative group aspect-square border-2 overflow-hidden bg-gray-50 transition-colors ${
                          formData.image === file.url ? 'border-brand' : 'border-gray-300 hover:border-brand'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                        {formData.image === file.url && (
                          <span className="absolute top-0 right-0 w-6 h-6 bg-brand text-white flex items-center justify-center" aria-hidden="true">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 5 5L20 7" /></svg>
                          </span>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.name}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-gray-300">
              <button type="button" onClick={() => setShowImagePicker(false)} className={btnSecondary}>
                {dict.common?.cancel || 'Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {DuplicateDialog}
    </>
  );
}

function BulkRestockForm({
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
    <>
      <DrawerHeader
        title={dict.products?.restockSelected || 'Restock Selected'}
        subtitle={`${products.length} ${dict.admin?.selected || 'selected'}`}
        onClose={onClose}
        closeLabel={dict.common?.close || 'Close'}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <p className="text-sm text-gray-500">
            {dict.products?.restockDescription ||
              `Enter the quantity received for each product (${products.length} selected). Leave blank to skip a product.`}
          </p>

          <div className="border border-gray-300 divide-y divide-gray-200">
            {products.map((product) => (
              <div key={product._id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                  <p className="text-xs text-gray-500">
                    <span className="font-mono">{product.sku || '—'}</span> · {dict.admin?.stock || 'Stock'}:{' '}
                    <span className="tabular-nums">{product.trackInventory ? product.stock.toLocaleString() : '∞'}</span>
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  aria-label={`${dict.products?.restockConfirm || 'Restock'} ${product.name}`}
                  value={quantities[product._id] || ''}
                  onChange={(e) => setQuantity(product._id, e.target.value)}
                  className="w-24 px-2 py-1.5 border border-gray-300 text-sm text-right tabular-nums"
                />
              </div>
            ))}
          </div>

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary} disabled={saving}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" className={btnPrimary} disabled={saving}>
            {saving ? (dict.common?.saving || 'Saving…') : (dict.products?.restockConfirm || 'Restock')}
          </button>
        </div>
      </form>
    </>
  );
}

function BulkEditForm({
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

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch, categories]);

  const handleCategorySelect = (category: Category) => {
    setCategoryId(category.id);
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
        setError((dict.products?.fieldRequired || '{field} is required').replace('{field}', dict.admin?.price || 'Price'));
        return;
      }
      updates.price = { mode: priceMode, value };
    }

    if (applyStock && showInventory) {
      const value = parseInt(stockValue, 10);
      if (isNaN(value)) {
        setError((dict.products?.fieldRequired || '{field} is required').replace('{field}', dict.admin?.stock || 'Stock'));
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
        setError((dict.products?.fieldRequired || '{field} is required').replace('{field}', dict.admin?.lowStockThreshold || 'Low stock threshold'));
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

  return (
    <>
      <DrawerHeader
        title={dict.products?.bulkEditTitle || 'Bulk Edit Products'}
        subtitle={`${count} ${dict.admin?.selected || 'selected'}`}
        onClose={onClose}
        closeLabel={dict.common?.close || 'Close'}
      />
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="bg-brand-soft border border-brand p-4 text-sm text-brand-navy">
            {dict.products?.bulkEditSubtitle || 'Only checked fields will be applied.'}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={applyCategory}
                onChange={(e) => setApplyCategory(e.target.checked)}
                className="checkbox-win8"
              />
              {dict.products?.applyField || 'Apply'} {dict.admin?.category || 'Category'}
            </label>
            {applyCategory && (
              <div ref={categoryInputRef} className="relative">
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCategorySearch(value);
                    setShowCategorySuggestions(true);
                    const match = categories.find(
                      (cat) => cat.name.toLowerCase() === value.toLowerCase()
                    );
                    setCategoryId(match?.id || '');
                  }}
                  onFocus={() => setShowCategorySuggestions(true)}
                  placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                  className={inputCls}
                />
                {showCategorySuggestions && filteredCategories.length > 0 && (
                  <div
                    ref={categoryListRef}
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-300 max-h-40 overflow-y-auto"
                  >
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategorySelect(cat)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                          categoryId === cat.id ? 'bg-brand-soft font-medium text-brand-navy' : 'text-gray-700'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={applyPrice}
                onChange={(e) => setApplyPrice(e.target.checked)}
                className="checkbox-win8"
              />
              {dict.products?.applyField || 'Apply'} {dict.admin?.price || 'Price'}
            </label>
            {applyPrice && (
              <div className="flex gap-2">
                <select
                  value={priceMode}
                  onChange={(e) => setPriceMode(e.target.value as 'set' | 'percent' | 'add')}
                  aria-label={dict.admin?.price || 'Price'}
                  className="px-3 py-2 border border-gray-300 text-sm bg-white"
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
                  className="flex-1 px-3 py-2 border border-gray-300 text-sm bg-white tabular-nums"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {showInventory && (
            <>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyStock}
                    onChange={(e) => setApplyStock(e.target.checked)}
                    className="checkbox-win8"
                  />
                  {dict.products?.applyField || 'Apply'} {dict.admin?.stock || 'Stock'}
                </label>
                {applyStock && (
                  <div className="flex gap-2">
                    <select
                      value={stockMode}
                      onChange={(e) => setStockMode(e.target.value as 'set' | 'add')}
                      aria-label={dict.admin?.stock || 'Stock'}
                      className="px-3 py-2 border border-gray-300 text-sm bg-white"
                    >
                      <option value="set">{dict.products?.stockModeSet || 'Set to'}</option>
                      <option value="add">{dict.products?.stockModeAdd || 'Add'}</option>
                    </select>
                    <input
                      type="number"
                      step="1"
                      value={stockValue}
                      onChange={(e) => setStockValue(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 text-sm bg-white tabular-nums"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyTrackInventory}
                    onChange={(e) => setApplyTrackInventory(e.target.checked)}
                    className="checkbox-win8"
                  />
                  {dict.products?.applyField || 'Apply'} {dict.admin?.trackInventory || 'Track Inventory'}
                </label>
                {applyTrackInventory && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 ml-6">
                    <input
                      type="checkbox"
                      checked={trackInventory}
                      onChange={(e) => setTrackInventory(e.target.checked)}
                      className="checkbox-win8"
                    />
                    {dict.admin?.trackInventory || 'Track Inventory'}
                  </label>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyLowStockThreshold}
                    onChange={(e) => setApplyLowStockThreshold(e.target.checked)}
                    className="checkbox-win8"
                  />
                  {dict.products?.applyField || 'Apply'} {dict.admin?.lowStockThreshold || 'Low Stock Threshold'}
                </label>
                {applyLowStockThreshold && (
                  <input
                    type="number"
                    min="0"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className={inputCls}
                  />
                )}
              </div>
            </>
          )}

          {error && <div className="bg-win8-danger text-white text-sm p-3">{error}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-300 justify-end shrink-0">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {dict.common?.cancel || 'Cancel'}
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? (dict.common?.saving || 'Saving…') : (dict.common?.save || 'Save')}
          </button>
        </div>
      </form>
    </>
  );
}

