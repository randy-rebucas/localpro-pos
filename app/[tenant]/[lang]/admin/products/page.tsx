'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const BarcodeModal = dynamic(() => import('@/components/BarcodeModal'), { ssr: false });
const ProductImportModal = dynamic(() => import('@/components/ProductImportModal'), { ssr: false });
import { getDictionaryClient } from '../../dictionaries-client';
import Currency from '@/components/Currency';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { getBusinessTypeConfig, getAllowedProductTypes } from '@/lib/business-types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { getBusinessType } from '@/lib/business-type-helpers';
import { Barcode, Pencil, RefreshCw, Trash2 } from 'lucide-react';
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

const btnPrimary =
  'px-4 py-2 bg-brand text-white hover:bg-brand-hover font-medium border border-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimarySm = `${btnPrimary} text-sm`;
const btnSecondary =
  'px-4 py-2 border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 bg-white transition-colors';
const btnSecondarySm =
  `${btnSecondary} text-sm disabled:opacity-50 disabled:cursor-not-allowed`;
const btnSecondaryIcon = `${btnSecondary} inline-flex items-center gap-2`;
const btnDropdownItem =
  'block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed';
const btnTableIcon =
  'p-1.5 border border-transparent hover:border-gray-200 hover:bg-gray-50 transition-colors';

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
  const [page, setPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 20;
  const { settings } = useTenantSettings();
  const { confirm, Dialog } = useConfirm();
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
    fetchProducts({ page, limit: PAGE_SIZE, search: debouncedSearch });
  }, [fetchProducts, page, debouncedSearch]);

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
  }, [page, debouncedSearch]);

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
      showToast.error(result.error || 'Failed to update products');
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

  if (!dict || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-b-2 border-brand"></div>
          <p className="mt-4 text-gray-600">{dict?.common?.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {Dialog}
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <Link
            href={`/${tenant}/${lang}/admin`}
            className="inline-flex items-center text-brand hover:text-brand-hover font-medium mb-4 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {dict?.admin?.backToAdmin || 'Back to Admin'}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {dict.admin?.products || 'Products'}
              </h1>
              <p className="text-gray-600">{dict.admin?.productsSubtitle || 'Manage products, variations, and bundles'}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-red-800 border-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-300 p-6">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder={dict.common?.search || 'Search products...'}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  disabled={exporting}
                  className={btnSecondarySm}
                >
                  {exporting
                    ? (dict.products?.exporting || 'Exporting...')
                    : `${dict.admin?.export || 'Export'} ▼`}
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 shadow-lg hidden group-hover:block z-10">
                  <button
                    type="button"
                    onClick={() => handleExport('csv')}
                    disabled={exporting}
                    className={btnDropdownItem}
                  >
                    {dict.admin?.exportCSV || 'Export CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('excel')}
                    disabled={exporting}
                    className={btnDropdownItem}
                  >
                    {dict.admin?.exportExcel || 'Export Excel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport('pdf')}
                    disabled={exporting}
                    className={btnDropdownItem}
                  >
                    {dict.admin?.exportPDF || 'Export PDF'}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className={btnSecondaryIcon}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {dict.products?.import || 'Import'}
              </button>
              <Link
                href={`/${tenant}/${lang}/admin/file-upload`}
                className={btnSecondaryIcon}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {dict.products?.uploadImages || 'Upload Images'}
              </Link>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setShowProductModal(true);
                }}
                className={btnPrimary}
              >
                {dict.common?.add || 'Add'} {dict.admin?.product || 'Product'}
              </button>
            </div>
          </div>

          {selectedProducts.size > 0 && (
            <div className="mb-4 p-3 bg-brand-soft border border-teal-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm font-medium text-brand-navy-deep">
                {selectedProducts.size} {dict.admin?.selected || 'selected'}
              </span>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowBulkEditModal(true)}
                  className={btnPrimarySm}
                >
                  {dict.products?.bulkEdit || 'Edit Selected'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProducts(new Set())}
                  className={btnSecondarySm}
                >
                  {dict.common?.cancel || 'Cancel'}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={selectedProducts.size === products.length && products.length > 0}
                      onChange={handleSelectAll}
                      className="checkbox-win8"
                      aria-label={dict.common?.selectAll || 'Select all'}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.products?.imageHeader || 'Image'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.name || 'Name'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.category || 'Category'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.price || 'Price'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.admin?.stock || 'Stock'}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{dict.common?.type || 'Type'}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{dict.common?.actions || 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => (
                  <tr key={product._id}>
                    <td className="px-4 py-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.has(product._id)}
                        onChange={() => handleSelectProduct(product._id)}
                        className="checkbox-win8"
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                    <td className="px-4 py-4 w-14">
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image} alt={product.name} className="w-10 h-10 object-cover border border-gray-200 rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 border border-gray-200 rounded flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      {product.description && (
                        <div className="text-xs text-gray-500 mt-1">{product.description.substring(0, 50)}...</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{product.sku || '-'}</div>
                      {product.barcode && (
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{product.barcode}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {typeof product.categoryId === 'object' && product.categoryId?.name ? product.categoryId.name : product.category || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <Currency amount={product.price} />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`text-sm font-medium ${product.stock < (product.lowStockThreshold || 10) ? 'text-red-600' : 'text-gray-900'}`}>
                        {product.trackInventory ? product.stock : '∞'}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold border border-teal-300 bg-brand-soft text-brand-navy">
                        {product.productType}
                        {product.hasVariations && ` ${dict.products?.variations || '(variations)'}`}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setBarcodeProduct(product)}
                          className={`${btnTableIcon} text-gray-600 hover:text-gray-900`}
                          title={dict.products?.barcode || 'Barcode'}
                          aria-label={dict.products?.barcode || 'Barcode'}
                        >
                          <Barcode className="w-4 h-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(product);
                            setShowProductModal(true);
                          }}
                          className={`${btnTableIcon} text-brand hover:text-brand-navy-deep`}
                          title={dict.common?.edit || 'Edit'}
                          aria-label={dict.common?.edit || 'Edit'}
                        >
                          <Pencil className="w-4 h-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product._id)}
                          className={`${btnTableIcon} text-red-600 hover:text-red-900`}
                          title={dict.common?.delete || 'Delete'}
                          aria-label={dict.common?.delete || 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                {debouncedSearch ? (dict.common?.noResults || 'No products found') : (dict.common?.noData || 'No products yet')}
              </div>
            )}
          </div>
          {pagination.pages > 1 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                {dict.admin?.showing || 'Showing'}{' '}
                {(pagination.page - 1) * pagination.limit + 1}
                {' '}{dict.admin?.to || 'to'}{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)}
                {' '}{dict.admin?.of || 'of'}{' '}
                {pagination.total}
                {' '}{dict.admin?.results || 'results'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={btnSecondarySm}
                >
                  {dict.common?.previous || 'Previous'}
                </button>
                <span className="px-2 text-sm text-gray-700">
                  {dict.admin?.page || 'Page'} {page} {dict.admin?.of || 'of'} {pagination.pages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                  className={btnSecondarySm}
                >
                  {dict.common?.next || 'Next'}
                </button>
              </div>
            </div>
          )}
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
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);

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
        cat => cat._id === (typeof product.categoryId === 'object' && product.categoryId?._id ? product.categoryId._id : product.categoryId)
      );
      if (currentCategory) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await submitForm(settings);
    if (result.success) {
      onSave();
    }
  };

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {product ? (dict.admin?.editProduct || 'Edit Product') : (dict.admin?.addProduct || 'Add Product')}
          </h2>
          {businessTypeConfig && (
            <div className="mb-4 p-3 bg-brand-soft border border-teal-200 rounded">
              <p className="text-sm text-brand-navy-deep">
                <strong>{dict.products?.businessType || 'Business Type'}:</strong> {businessTypeConfig.name}
              </p>
              <p className="text-xs text-brand-hover mt-1">
                {businessTypeConfig.description}
              </p>
              {businessTypeConfig.requiredFields.length > 0 && (
                <p className="text-xs text-brand-hover mt-1">
                  <strong>{dict.products?.requiredFields || 'Required fields'}:</strong> {businessTypeConfig.requiredFields.join(', ')}
                </p>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.name || 'Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => updateFormData({ name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU {businessTypeConfig?.requiredFields?.includes('sku') && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  required={businessTypeConfig?.requiredFields?.includes('sku')}
                  value={formData.sku}
                  onChange={(e) => updateFormData({ sku: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.products?.barcode || 'Barcode'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => updateFormData({ barcode: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white font-mono"
                  placeholder={dict.products?.scanOrEnterBarcode || 'Scan or enter barcode'}
                />
                <button
                  type="button"
                  onClick={() => updateFormData({ barcode: generateEAN13Helper() })}
                  className="px-3 py-2 border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  title={dict.products?.generateEan13Title || 'Generate EAN-13 barcode'}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {dict.products?.generate || 'Generate'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.admin?.description || 'Description'}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateFormData({ description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {dict.products?.productImage || 'Product Image'}
              </label>
              <div className="flex gap-3 items-start">
                {formData.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="w-20 h-20 object-cover border border-gray-200 rounded flex-shrink-0"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer text-sm text-gray-700 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {dict.products?.upload || 'Upload'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 10 * 1024 * 1024) {
                            alert(dict.products?.fileTooLarge || 'File too large. Maximum size: 10MB');
                            return;
                          }
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
                              alert(data.error || dict.products?.failedToUploadImage || 'Failed to upload image');
                            }
                          } catch {
                            alert(dict.products?.uploadFailed || 'Upload failed');
                          }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={openImagePicker}
                      className="px-3 py-2 border border-gray-300 bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors"
                    >
                      {dict.products?.browse || 'Browse'}
                    </button>
                  </div>
                  <input
                    type="url"
                    value={formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={(e) => updateFormData({ image: e.target.value })}
                    placeholder={dict.products?.pasteImageUrl || 'Or paste image URL (https://...)'}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white text-sm"
                  />
                  {formData.image && (
                    <button
                      type="button"
                      onClick={() => updateFormData({ image: '' })}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      {dict.products?.removeImage || 'Remove image'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className={`grid gap-4 ${businessTypeConfig?.defaultFeatures?.enableInventory !== false ? 'grid-cols-3' : 'grid-cols-1'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.admin?.price || 'Price'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.price}
                  onChange={(e) => updateFormData({ price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
              </div>
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict.admin?.stock || 'Stock'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => updateFormData({ stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    disabled={!formData.trackInventory}
                  />
                </div>
              )}
              {businessTypeConfig?.defaultFeatures?.enableInventory !== false && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {dict.admin?.lowStockThreshold || 'Low Stock Threshold'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.lowStockThreshold}
                    onChange={(e) => updateFormData({ lowStockThreshold: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        updateFormData({ categoryId: matchingCategory._id });
                      } else {
                        updateFormData({ categoryId: '' });
                      }
                    }}
                    onFocus={() => setShowCategorySuggestions(true)}
                    placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  />
                  {showCategorySuggestions && filteredCategories.length > 0 && (
                    <div
                      ref={categoryListRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-gray-300 max-h-60 overflow-y-auto"
                    >
                      {filteredCategories.map((cat) => (
                        <button
                          key={cat._id}
                          type="button"
                          onClick={() => handleCategorySelect(cat)}
                          className={`w-full text-left px-4 py-2 hover:bg-brand-soft focus:bg-brand-soft focus:outline-none transition-colors ${
                            formData.categoryId === cat._id ? 'bg-brand-soft' : ''
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {dict.common?.type || 'Type'} {businessTypeConfig && `(${businessTypeConfig.name})`}
                </label>
                <select
                  value={formData.productType}
                  onChange={(e) => updateFormData({ productType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
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
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.trackInventory}
                    onChange={(e) => updateFormData({ trackInventory: e.target.checked })}
                    className="checkbox-win8 mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {dict.admin?.trackInventory || 'Track Inventory'}
                  </span>
                </label>
              </div>
            )}

            {/* Restaurant-specific fields */}
            {settings?.businessType?.toLowerCase() === 'restaurant' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{dict.products?.restaurantInfo || 'Restaurant Information'}</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.allergens || 'Allergens (comma-separated)'}</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.allergens) ? formData.allergens.join(', ') : formData.allergens || ''}
                    onChange={(e) => {
                      const allergens = e.target.value.split(',').map(a => a.trim()).filter(a => a);
                      updateFormData({ allergens });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    placeholder="e.g., gluten, dairy, nuts"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.calories || 'Calories'}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.nutritionInfo?.calories || ''}
                      onChange={(e) => updateFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, calories: parseInt(e.target.value) || undefined }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.protein || 'Protein (g)'}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={formData.nutritionInfo?.protein || ''}
                      onChange={(e) => updateFormData({
                        ...formData,
                        nutritionInfo: { ...formData.nutritionInfo, protein: parseFloat(e.target.value) || undefined }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                </div>

                {/* Modifier Groups */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-700">{dict.products?.modifierGroups || 'Modifier Groups'}</label>
                    <button
                      type="button"
                      onClick={() => updateFormData({
                        modifiers: [
                          ...(formData.modifiers || []),
                          { name: '', options: [{ name: '', price: 0 }], required: false },
                        ],
                      })}
                      className="text-xs px-2 py-1 bg-orange-50 border border-orange-300 text-orange-700 hover:bg-orange-100 font-semibold"
                    >
                      {dict.products?.addGroup || '+ Add Group'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(formData.modifiers || []).map((group, gi) => (
                      <div key={gi} className="border border-gray-200 p-3 bg-gray-50 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => {
                              const mods = [...(formData.modifiers || [])];
                              mods[gi] = { ...mods[gi], name: e.target.value };
                              updateFormData({ modifiers: mods });
                            }}
                            placeholder="Group name (e.g. Temperature)"
                            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 bg-white focus:ring-1 focus:ring-orange-400 focus:outline-none"
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
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Remove group"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
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
                                placeholder="Option (e.g. Rare)"
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 bg-white focus:ring-1 focus:ring-orange-400 focus:outline-none"
                              />
                              <span className="text-xs text-gray-400 flex-shrink-0">+$</span>
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
                                className="w-20 px-2 py-1 text-sm border border-gray-300 bg-white focus:ring-1 focus:ring-orange-400 focus:outline-none"
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
                                className="text-red-400 hover:text-red-600 p-0.5"
                                title="Remove option"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
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
                            className="text-xs text-orange-600 hover:text-orange-800 font-medium"
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
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{dict.products?.laundryInfo || 'Laundry Service Information'}</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.serviceType || 'Service Type'}</label>
                  <select
                    value={formData.serviceType}
                    onChange={(e) => updateFormData({ serviceType: e.target.value as any })} // eslint-disable-line @typescript-eslint/no-explicit-any
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  >
                    <option value="wash">{dict.products?.serviceTypeWash || 'Wash'}</option>
                    <option value="dry-clean">{dict.products?.serviceTypeDryClean || 'Dry Clean'}</option>
                    <option value="press">{dict.products?.serviceTypePress || 'Press'}</option>
                    <option value="repair">{dict.products?.serviceTypeRepair || 'Repair'}</option>
                    <option value="other">{dict.products?.serviceTypeOther || 'Other'}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.weightBased}
                        onChange={(e) => updateFormData({ weightBased: e.target.checked })}
                        className="checkbox-win8 mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">{dict.products?.weightBased || 'Weight-based pricing'}</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.pickupDelivery}
                        onChange={(e) => updateFormData({ pickupDelivery: e.target.checked })}
                        className="checkbox-win8 mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">{dict.products?.pickupDelivery || 'Pickup & Delivery'}</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.estimatedDuration || 'Estimated Duration (minutes)'}</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.estimatedDuration || ''}
                    onChange={(e) => updateFormData({ estimatedDuration: parseInt(e.target.value) || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                  />
                </div>
              </div>
            )}

            {/* Service-specific fields */}
            {settings?.businessType?.toLowerCase() === 'service' && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{dict.products?.serviceInfo || 'Service Information'}</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.serviceDuration || 'Service Duration (minutes)'}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.serviceDuration || ''}
                      onChange={(e) => updateFormData({ serviceDuration: parseInt(e.target.value) || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.staffRequired || 'Staff Required'}</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.staffRequired || 1}
                      onChange={(e) => updateFormData({ staffRequired: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{dict.products?.equipmentRequired || 'Equipment Required (comma-separated)'}</label>
                  <input
                    type="text"
                    value={Array.isArray(formData.equipmentRequired) ? formData.equipmentRequired.join(', ') : formData.equipmentRequired || ''}
                    onChange={(e) => {
                      const equipment = e.target.value.split(',').map(e => e.trim()).filter(e => e);
                      updateFormData({ equipmentRequired: equipment });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                    placeholder="e.g., scissors, clippers, styling chair"
                  />
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-800 border border-red-300 p-3">
                {error}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-4">
              <button
                type="button"
                onClick={onClose}
                className={btnSecondary}
              >
                {dict.common?.cancel || 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className={btnPrimary}
              >
                {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

      {/* Image Picker Modal */}
      {showImagePicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-200 shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-semibold text-gray-900">{dict.products?.selectImage || 'Select Image'}</h3>
              <button type="button" onClick={() => setShowImagePicker(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
              <input
                type="text"
                placeholder={dict.products?.searchImages || 'Search images...'}
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 text-sm bg-white"
              />
              <label className={`${btnPrimarySm} cursor-pointer ${pickerUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {pickerUploading ? (dict.products?.uploading || 'Uploading...') : (dict.products?.uploadNew || 'Upload New')}
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
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-2 border-gray-400 border-t-transparent rounded-full" />
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
                        className={`relative group aspect-square border-2 overflow-hidden bg-gray-50 ${
                          formData.image === file.url ? 'border-brand' : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                        {formData.image === file.url && (
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                            <span className="text-white text-lg">✓</span>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.name}
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex justify-end px-5 py-3 border-t border-gray-200">
              <button type="button" onClick={() => setShowImagePicker(false)} className={btnSecondarySm}>
                {dict.common?.cancel || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
        setError(dict.admin?.price || 'Price' + ' is required');
        return;
      }
      updates.price = { mode: priceMode, value };
    }

    if (applyStock && showInventory) {
      const value = parseInt(stockValue, 10);
      if (isNaN(value)) {
        setError(dict.admin?.stock || 'Stock' + ' is required');
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
        setError(dict.admin?.lowStockThreshold || 'Low stock threshold' + ' is required');
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {dict.products?.bulkEditTitle || 'Bulk Edit Products'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {(dict.products?.bulkEditSubtitle || 'Only checked fields will be applied.') + ` (${count})`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                    setCategoryId(match?._id || '');
                  }}
                  onFocus={() => setShowCategorySuggestions(true)}
                  placeholder={dict.admin?.searchCategory || 'Type to search categories...'}
                  className="w-full px-3 py-2 border border-gray-300 focus:ring-2 focus:ring-brand bg-white"
                />
                {showCategorySuggestions && filteredCategories.length > 0 && (
                  <div
                    ref={categoryListRef}
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-300 max-h-40 overflow-y-auto"
                  >
                    {filteredCategories.map((cat) => (
                      <button
                        key={cat._id}
                        type="button"
                        onClick={() => handleCategorySelect(cat)}
                        className={`w-full text-left px-4 py-2 hover:bg-brand-soft focus:bg-brand-soft focus:outline-none ${
                          categoryId === cat._id ? 'bg-brand-soft' : ''
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
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                  className="px-3 py-2 border border-gray-300 bg-white"
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
                  className="flex-1 px-3 py-2 border border-gray-300 bg-white"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          {showInventory && (
            <>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                      className="px-3 py-2 border border-gray-300 bg-white"
                    >
                      <option value="set">{dict.products?.stockModeSet || 'Set to'}</option>
                      <option value="add">{dict.products?.stockModeAdd || 'Add'}</option>
                    </select>
                    <input
                      type="number"
                      step="1"
                      value={stockValue}
                      onChange={(e) => setStockValue(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 bg-white"
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
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
                    className="w-full px-3 py-2 border border-gray-300 bg-white"
                  />
                )}
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 text-red-800 border border-red-300 p-3 text-sm">{error}</div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className={btnSecondary}
            >
              {dict.common?.cancel || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className={btnPrimary}
            >
              {saving ? (dict.common?.loading || 'Saving...') : (dict.common?.save || 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

