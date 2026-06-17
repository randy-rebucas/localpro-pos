'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { normalizeImageUrl } from '@/lib/image-utils';
import PageLoading from '@/components/ui/PageLoading';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProductsCatalogSkeleton from '@/components/products/ProductsCatalogSkeleton';
import { useParams } from 'next/navigation';
import { getDictionaryClient } from '../dictionaries-client';
import { showToast } from '@/lib/toast';
import { useConfirm } from '@/lib/confirm';
import { useTenantSettings } from '@/contexts/TenantSettingsContext';
import { getDefaultTenantSettings } from '@/lib/currency';
import { supportsFeature } from '@/lib/business-type-helpers';
import { useProductsCatalog, type CatalogProduct } from '@/hooks/useProductsCatalog';
import type { TranslationDict } from '@/types/dictionary';

const ProductModal = dynamic(() => import('@/components/ProductModal'), {
  ssr: false,
  loading: () => <LoadingSpinner className="py-8" />,
});
const StockRefillModal = dynamic(() => import('@/components/StockRefillModal'), {
  ssr: false,
  loading: () => <LoadingSpinner className="py-8" />,
});
const BarcodeModal = dynamic(() => import('@/components/BarcodeModal'), {
  loading: () => null,
  ssr: false,
});

type Product = CatalogProduct;

export default function ProductsPage() {
  const params = useParams();
  const tenant = params.tenant as string;
  const lang = params.lang as 'en' | 'es';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PRODUCTS_PER_PAGE = 10;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefillModalOpen, setIsRefillModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [refillingProduct, setRefillingProduct] = useState<Product | null>(null);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [dict, setDict] = useState<TranslationDict | null>(null);
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>('list');
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');

  const { products, status, error, refetch } = useProductsCatalog(tenant, search);

  useEffect(() => {
    getDictionaryClient(lang).then(setDict);
  }, [lang]);

  useEffect(() => {
    const savedDisplayMode = localStorage.getItem(`displayMode_${tenant}`);
    if (savedDisplayMode === 'list' || savedDisplayMode === 'grid') {
      setDisplayMode(savedDisplayMode);
    }
  }, [tenant]);

  useEffect(() => {
    localStorage.setItem(`displayMode_${tenant}`, displayMode);
  }, [displayMode, tenant]);

  const sortedProducts = [...products].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  useEffect(() => {
    setPage(1);
  }, [search, products.length]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PRODUCTS_PER_PAGE));
  const paginatedProducts = sortedProducts.slice((page - 1) * PRODUCTS_PER_PAGE, page * PRODUCTS_PER_PAGE);

  const handleDelete = async (id: string) => {
    if (!dict) return;
    const confirmed = await confirm(
      dict.products?.deleteConfirmTitle || 'Delete Product',
      dict.products?.deleteConfirm || 'Are you sure you want to delete this product?',
      { variant: 'danger' }
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/products/${id}?tenant=${tenant}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict.products?.productDeleted || 'Product deleted successfully');
        refetch();
      } else {
        showToast.error(data.error || dict.products?.deleteError || 'Failed to delete product');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      showToast.error(dict.products?.deleteError || 'Failed to delete product');
    }
  };

  const handleEdit = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product._id}?tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setEditingProduct(data.data);
        setIsModalOpen(true);
      } else {
        setEditingProduct(product);
        setIsModalOpen(true);
      }
    } catch (err) {
      console.error('Error fetching product:', err);
      setEditingProduct(product);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    refetch();
  };

  const handleRefill = (product: Product) => {
    setRefillingProduct(product);
    setIsRefillModalOpen(true);
  };

  const handleCloseRefillModal = () => {
    setIsRefillModalOpen(false);
    setRefillingProduct(null);
  };

  const handleRefillSuccess = () => {
    refetch();
  };

  if (!dict) {
    return <PageLoading label="Loading..." />;
  }

  const productsDict = dict.products ?? {};

  const renderProductContent = () => {
    if (status === 'loading') {
      return <ProductsCatalogSkeleton mode={displayMode} />;
    }

    if (status === 'error') {
      return (
        <div className="bg-white border border-gray-300">
          <ErrorState
            title={productsDict.failedToLoadProducts || 'Failed to load products'}
            description={error || undefined}
            onRetry={refetch}
            retryLabel={dict.common.retry || 'Retry'}
          />
        </div>
      );
    }

    if (products.length === 0) {
      return (
        <EmptyState
          icon={search ? 'search' : 'products'}
          title={search ? (dict.common.noResults || 'No results found') : (productsDict.noProductsYet || 'No products yet')}
          action={
            search
              ? { label: productsDict.clearSearch || 'Clear search', onClick: () => setSearch('') }
              : { label: productsDict.addProduct || 'Add Product', onClick: () => setIsModalOpen(true) }
          }
          className="bg-white border border-gray-300"
        />
      );
    }

    if (displayMode === 'grid') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
          {paginatedProducts.map((product) => (
            <div
              key={product._id}
              className="group relative bg-white border border-gray-300 rounded-lg p-4 sm:p-5 transition-all duration-200 flex flex-col"
              style={{
                boxShadow: 'none',
                borderColor: '#d1d5db',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.borderColor = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              <div className="mb-3 -mx-4 -mt-4 sm:-mx-5 sm:-mt-5">
                {product.image ? (
                  <div className="relative w-full h-36">
                    <Image
                      src={normalizeImageUrl(product.image)}
                      alt={product.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      loading="lazy"
                      className="object-cover rounded-t-lg"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const placeholder = img.parentElement?.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                  </div>
                ) : null}
                <div
                  className="w-full h-36 bg-gray-100 rounded-t-lg flex items-center justify-center"
                  style={{ display: product.image ? 'none' : 'flex' }}
                >
                  <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              <div className="flex-1 mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-lg sm:text-xl pr-2 flex-1">
                    {product.name}
                    {product.pinned && (
                      <svg className="inline-block w-4 h-4 ml-2" style={{ color: primaryColor }} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16a1 1 0 11-2 0V6.477L5.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 013 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                      </svg>
                    )}
                  </h3>
                </div>

                {product.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{product.description}</p>
                )}

                <div className="flex flex-wrap gap-3 mb-3 text-xs sm:text-sm text-gray-600">
                  {product.sku && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{productsDict.sku}:</span>
                      <span>{product.sku}</span>
                    </div>
                  )}
                  {product.barcode && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h1v12H4V6zm2 0h1v12H6V6zm3 0h2v12H9V6zm3 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6z" />
                      </svg>
                      <span className="font-mono">{product.barcode}</span>
                    </div>
                  )}
                  {product.category && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{productsDict.category}:</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded border border-gray-300">{product.category}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">{productsDict.price}</div>
                    <div className="font-bold text-xl sm:text-2xl" style={{ color: primaryColor }}>
                      <Currency amount={product.price} />
                    </div>
                  </div>
                  {inventoryEnabled && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1">{productsDict.stock}</div>
                      <span
                        className={`inline-block text-xs font-semibold px-3 py-1.5 rounded border ${
                          product.stock > 10
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : product.stock > 0
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {product.stock} {productsDict.inStock}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 actions-touch-visible transition-opacity duration-200">
                  {inventoryEnabled && (
                    <button
                      onClick={() => handleRefill(product)}
                      className="flex-1 py-2.5 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-all duration-200 border border-green-700 flex items-center justify-center touch-manipulation min-h-[44px]"
                      title={productsDict.refill?.title || 'Refill Stock'}
                      aria-label={productsDict.refill?.title || 'Refill Stock'}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => setBarcodeProduct(product)}
                    className="flex-1 py-2.5 bg-gray-700 text-white hover:bg-gray-800 active:bg-gray-900 transition-all duration-200 border border-gray-800 flex items-center justify-center touch-manipulation min-h-[44px]"
                    title={productsDict.viewBarcode || 'View Barcode'}
                    aria-label={productsDict.viewBarcode || 'View Barcode'}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h1v12H4V6zm2 0h1v12H6V6zm3 0h2v12H9V6zm3 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEdit(product)}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                    className="flex-1 py-2.5 text-white active:opacity-80 transition-all duration-200 border flex items-center justify-center touch-manipulation min-h-[44px] hover:opacity-90"
                    title={dict.common.edit}
                    aria-label={dict.common.edit}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(product._id)}
                    className="flex-1 py-2.5 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-all duration-200 border border-red-700 flex items-center justify-center touch-manipulation min-h-[44px]"
                    title={dict.common.delete}
                    aria-label={dict.common.delete}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="bg-white border border-gray-300 divide-y divide-gray-300">
        {paginatedProducts.map((product) => (
          <div key={product._id} className="group relative px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-gray-50 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
              <div className="flex gap-3 flex-1 min-w-0">
                {product.image ? (
                  <div className="relative w-10 h-10 flex-shrink-0 self-center">
                    <Image
                      src={normalizeImageUrl(product.image)}
                      alt={product.name}
                      fill
                      sizes="40px"
                      loading="lazy"
                      className="object-cover border border-gray-200"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const placeholder = img.parentElement?.nextElementSibling as HTMLElement | null;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                  </div>
                ) : null}
                <div
                  className="w-10 h-10 bg-gray-100 border border-gray-200 flex-shrink-0 items-center justify-center self-center"
                  style={{ display: product.image ? 'none' : 'flex' }}
                >
                  <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                    {product.name}
                    {product.pinned && (
                      <svg className="inline-block w-3.5 h-3.5 ml-1.5" style={{ color: primaryColor }} fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16a1 1 0 11-2 0V6.477L5.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 013 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                      </svg>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {product.sku && <span>{productsDict.sku}: {product.sku}</span>}
                    {product.barcode && <span className="font-mono">{product.barcode}</span>}
                    {product.category && (
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300">{product.category}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="font-bold text-base sm:text-lg" style={{ color: primaryColor }}>
                  <Currency amount={product.price} />
                </div>
                {inventoryEnabled && (
                  <span
                    className={`inline-block text-xs font-semibold px-2 py-1 rounded border ${
                      product.stock > 10
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : product.stock > 0
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        : 'bg-red-100 text-red-800 border-red-300'
                    }`}
                  >
                    {product.stock} {productsDict.inStock}
                  </span>
                )}
                <div className="flex gap-1.5 actions-touch-visible transition-opacity duration-200">
                  {inventoryEnabled && (
                    <button
                      onClick={() => handleRefill(product)}
                      className="px-2.5 py-1.5 bg-green-600 text-white hover:bg-green-700 active:bg-green-800 transition-all duration-200 border border-green-700 flex items-center justify-center touch-manipulation min-h-[36px] sm:min-h-0"
                      title={productsDict.refill?.title || 'Refill Stock'}
                      aria-label={productsDict.refill?.title || 'Refill Stock'}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => setBarcodeProduct(product)}
                    className="px-2.5 py-1.5 bg-gray-700 text-white hover:bg-gray-800 active:bg-gray-900 transition-all duration-200 border border-gray-800 flex items-center justify-center touch-manipulation min-h-[36px] sm:min-h-0"
                    title={productsDict.viewBarcode || 'View Barcode'}
                    aria-label={productsDict.viewBarcode || 'View Barcode'}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h1v12H4V6zm2 0h1v12H6V6zm3 0h2v12H9V6zm3 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleEdit(product)}
                    style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                    className="px-2.5 py-1.5 text-white active:opacity-80 transition-all duration-200 border flex items-center justify-center touch-manipulation min-h-[36px] sm:min-h-0 hover:opacity-90"
                    title={dict.common.edit}
                    aria-label={dict.common.edit}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(product._id)}
                    className="px-2.5 py-1.5 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-all duration-200 border border-red-700 flex items-center justify-center touch-manipulation min-h-[36px] sm:min-h-0"
                    title={dict.common.delete}
                    aria-label={dict.common.delete}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {ConfirmDialog}
      <PageTitle />
      <Navbar />
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{productsDict.title}</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              backgroundColor: primaryColor,
              borderColor: primaryColor,
            }}
            className="w-full sm:w-auto text-white px-5 py-2.5 font-semibold transition-all duration-200 border flex items-center justify-center gap-2 hover:opacity-90"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {productsDict.addProduct}
          </button>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={productsDict.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                borderWidth: '2px',
                borderColor: '#d1d5db',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = primaryColor;
                e.currentTarget.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
              }}
              className="w-full px-4 py-3 pl-11 text-base bg-white transition-all"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDisplayMode('grid')}
              style={{
                borderWidth: '2px',
                ...(displayMode === 'grid'
                  ? {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}10`,
                      color: primaryColor,
                    }
                  : {
                      borderColor: '#d1d5db',
                      color: '#374151',
                    }),
              }}
              className="px-4 py-3 bg-white transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-100"
              title={dict.common.gridView || 'Grid View'}
              aria-label={dict.common.gridView || 'Grid View'}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="hidden sm:inline">{dict.common.gridView || 'Grid'}</span>
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              style={{
                borderWidth: '2px',
                ...(displayMode === 'list'
                  ? {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}10`,
                      color: primaryColor,
                    }
                  : {
                      borderColor: '#d1d5db',
                      color: '#374151',
                    }),
              }}
              className="px-4 py-3 bg-white transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-100"
              title={dict.common.listView || 'List View'}
              aria-label={dict.common.listView || 'List View'}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        </div>

        {renderProductContent()}

        {status === 'ready' && totalPages > 1 && (
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 active:bg-gray-200 font-medium transition-colors bg-white touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {dict.common?.previous || 'Previous'}
            </button>
            <span className="px-4 py-2 text-sm sm:text-base text-gray-700 font-medium text-center">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-full sm:w-auto px-6 py-3 sm:px-4 sm:py-2 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 active:bg-gray-200 font-medium transition-colors bg-white touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {dict.common?.next || 'Next'}
            </button>
          </div>
        )}

        {isModalOpen && (
          <ProductModal product={editingProduct} onClose={handleCloseModal} lang={lang} />
        )}

        {isRefillModalOpen && (
          <StockRefillModal
            product={refillingProduct}
            onClose={handleCloseRefillModal}
            onSuccess={handleRefillSuccess}
            lang={lang}
          />
        )}

        {barcodeProduct && (
          <BarcodeModal
            value={barcodeProduct.barcode || barcodeProduct.sku || barcodeProduct._id}
            productName={barcodeProduct.name}
            onClose={() => setBarcodeProduct(null)}
          />
        )}
      </div>
    </div>
  );
}
