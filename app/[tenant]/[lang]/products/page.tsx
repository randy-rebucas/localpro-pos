'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import Currency from '@/components/Currency';
import PageTitle from '@/components/PageTitle';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { LayoutGrid, List, Package, PackagePlus, Pencil, Pin, Plus, RotateCcw, ScanBarcode, Search, Trash2 } from 'lucide-react';
import '@/app/marketing.css';
import { marketingFontClasses } from '@/components/marketing/fonts';
import { LineTag } from '@/components/marketing/primitives';
import { normalizeImageUrl } from '@/lib/image-utils';
import { productStockTotal } from '@/lib/product-variations';
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
import { useProductsCatalog, type CatalogActivity, type CatalogProduct, type CatalogSort } from '@/hooks/useProductsCatalog';
import { usePermissions } from '@/hooks/usePermissions';
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

const ICON = 'h-[18px] w-[18px]';

const FILTER_LABEL = 'mb-1 block font-receipt text-xs font-medium uppercase tracking-[0.08em] text-white/60';
const FILTER_FIELD = 'min-h-[44px] w-full border-2 border-transparent bg-paper-white px-3 py-2 font-receipt text-sm text-ink focus:border-[#8fe3d0] focus:outline-none';

function StockTag({ stock, threshold, label }: { stock: number; threshold: number; label?: string }) {
  const tone =
    stock > threshold
      ? 'border-ink/25 text-ink/70'
      : stock > 0
        ? 'border-ink bg-paper font-semibold text-ink'
        : 'border-stamp font-semibold text-stamp';
  return (
    <span className={`inline-block whitespace-nowrap border px-2 py-1 font-receipt text-xs ${tone}`}>
      {stock} {label}
    </span>
  );
}

function ProductPhoto({ product, sizes, className, iconClassName }: {
  product: Product;
  sizes: string;
  className: string;
  iconClassName: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = product.image ? normalizeImageUrl(product.image) : null;

  return (
    <div className={`relative flex shrink-0 items-center justify-center bg-paper ${className}`}>
      {src && src !== failedSrc ? (
        <Image
          src={src}
          alt={product.name}
          fill
          sizes={sizes}
          loading="lazy"
          className="object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Package className={`text-ink/25 ${iconClassName}`} strokeWidth={1.75} aria-hidden />
      )}
    </div>
  );
}

const categoryName = (product: Product) =>
  product.category || (product.categoryId && typeof product.categoryId === 'object' ? product.categoryId.name : '') || '';

function InactiveTag({ label }: { label?: string }) {
  return <span className="shrink-0 border border-dashed border-ink/40 px-1.5 py-0.5 font-receipt text-xs uppercase text-ink/60">{label}</span>;
}

function ProductMeta({ product, skuLabel, variationCount }: { product: Product; skuLabel?: string; variationCount?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-receipt text-xs text-ink/60">
      {product.sku && <span>{skuLabel}: {product.sku}</span>}
      {product.hasVariations && !!product.variations?.length && (
        <span>{(variationCount || '{count} variations').replace('{count}', String(product.variations.length))}</span>
      )}
      {product.barcode && <span>{product.barcode}</span>}
      {categoryName(product) && <span className="border border-ink/25 px-1.5 py-0.5">{categoryName(product)}</span>}
    </div>
  );
}

function PinMark({ color }: { color: string }) {
  return <Pin className="h-3.5 w-3.5 shrink-0" style={{ color }} fill="currentColor" strokeWidth={1.75} aria-hidden />;
}

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
  const [category, setCategory] = useState('');
  const [activity, setActivity] = useState<CatalogActivity>('active');
  const [sort, setSort] = useState<CatalogSort>('newest');
  const [categories, setCategories] = useState<string[]>([]);
  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { settings } = useTenantSettings();
  const primaryColor = (settings || getDefaultTenantSettings()).primaryColor || '#35979c';
  const inventoryEnabled = supportsFeature(settings ?? undefined, 'inventory');
  const { canAccess } = usePermissions();
  const canManage = canAccess('products.manage');

  const { products, total, totalPages, status, error, refetch } = useProductsCatalog(tenant, {
    search,
    page,
    pageSize: PRODUCTS_PER_PAGE,
    category,
    activity,
    sort,
  });

  useEffect(() => {
    let current = true;
    fetch(`/api/products/filters?tenant=${tenant}`)
      .then((res) => res.json())
      .then((data) => { if (current && data.success) setCategories(data.data.categories); })
      .catch(() => { /* the page works without the category list */ });
    return () => { current = false; };
  }, [tenant]);

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

  /** Any filter change starts again from the first page. */
  const applyFilter = (update: () => void) => {
    update();
    setPage(1);
  };

  const clearFilters = () => applyFilter(() => {
    setSearch('');
    setCategory('');
    setActivity('active');
    setSort('newest');
  });

  /** After a product leaves the current view, step back if that emptied the last page. */
  const refreshAfterRemoval = () => {
    if (products.length === 1 && page > 1) setPage(page - 1);
    else refetch();
  };

  const lowStockThreshold = (product: Product) => product.lowStockThreshold || (settings?.lowStockThreshold ?? 10);

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
        refreshAfterRemoval();
      } else {
        showToast.error(data.error || dict.products?.deleteError || 'Failed to delete product');
      }
    } catch (err) {
      console.error('Error deleting product:', err);
      showToast.error(dict.products?.deleteError || 'Failed to delete product');
    }
  };

  const handleReactivate = async (id: string) => {
    if (!dict) return;
    const failed = dict.products?.reactivateError || 'Failed to reactivate product';
    try {
      const res = await fetch(`/api/products/${id}?tenant=${tenant}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: true }),
      });
      const data = await res.json();
      if (data.success) {
        showToast.success(dict.products?.productReactivated || 'Product reactivated');
        if (activity === 'inactive') refreshAfterRemoval();
        else refetch();
      } else {
        showToast.error(data.error || failed);
      }
    } catch (err) {
      console.error('Error reactivating product:', err);
      showToast.error(failed);
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
    return (
      <div className="flex min-h-dvh items-center justify-center bg-brand-navy-deep">
        <LoadingSpinner size="md" color="#8fe3d0" />
      </div>
    );
  }

  const productsDict = dict.products ?? {};
  const filtersActive = !!search || !!category || activity !== 'active';
  const sortOptions: { value: CatalogSort; label: string }[] = [
    { value: 'newest', label: productsDict.sortNewest || 'Newest' },
    { value: 'name', label: productsDict.sortName || 'Name (A-Z)' },
    { value: 'price_asc', label: productsDict.sortPriceLow || 'Price: low to high' },
    { value: 'price_desc', label: productsDict.sortPriceHigh || 'Price: high to low' },
    { value: 'stock_asc', label: productsDict.sortStockLow || 'Stock: low to high' },
    { value: 'stock_desc', label: productsDict.sortStockHigh || 'Stock: high to low' },
  ];
  const showStock = (product: Product) => inventoryEnabled && product.trackInventory !== false;
  const canRefill = inventoryEnabled && canManage;
  const keyCount = 1 + (canManage ? 2 : 0) + (canRefill ? 1 : 0);

  /** A row of till keys: joined to the row in the list, spanning the bottom edge of a shelf tag. */
  const renderKeys = (product: Product, layout: 'row' | 'strip') => {
    const key = `flex min-h-[44px] items-center justify-center text-ink touch-manipulation transition-colors hover:bg-paper ${layout === 'strip' ? 'min-w-0 flex-1' : 'w-11'}`;
    return (
      <div className={`actions-touch-visible flex divide-x divide-ink/25 transition-opacity duration-200 ${layout === 'strip' ? 'border-t border-ink/25' : 'border border-ink/25'}`}>
        {canRefill && (
          <button
            type="button"
            onClick={() => handleRefill(product)}
            className={key}
            title={productsDict.refill?.title || 'Refill Stock'}
            aria-label={productsDict.refill?.title || 'Refill Stock'}
          >
            <PackagePlus className={ICON} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={() => setBarcodeProduct(product)}
          className={key}
          title={productsDict.viewBarcode || 'View Barcode'}
          aria-label={productsDict.viewBarcode || 'View Barcode'}
        >
          <ScanBarcode className={ICON} strokeWidth={1.75} aria-hidden />
        </button>
        {canManage && (
          <>
            <button
              type="button"
              onClick={() => handleEdit(product)}
              className={key}
              title={dict.common.edit}
              aria-label={dict.common.edit}
            >
              <Pencil className={ICON} strokeWidth={1.75} aria-hidden />
            </button>
            {product.isActive === false ? (
              <button
                type="button"
                onClick={() => handleReactivate(product._id)}
                className={key}
                title={productsDict.reactivate || 'Reactivate'}
                aria-label={productsDict.reactivate || 'Reactivate'}
              >
                <RotateCcw className={ICON} strokeWidth={1.75} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleDelete(product._id)}
                className={`${key} hover:text-stamp`}
                title={dict.common.delete}
                aria-label={dict.common.delete}
              >
                <Trash2 className={ICON} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  const renderProductContent = () => {
    if (status === 'loading') {
      return <ProductsCatalogSkeleton mode={displayMode} />;
    }

    if (status === 'error') {
      return (
        <div className="bg-paper-white text-ink">
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
          icon={filtersActive ? 'search' : 'products'}
          title={filtersActive ? (dict.common.noResults || 'No results found') : (productsDict.noProductsYet || 'No products yet')}
          action={
            filtersActive
              ? { label: productsDict.clearFilters || 'Clear filters', onClick: clearFilters }
              : canManage
                ? { label: productsDict.addProduct || 'Add Product', onClick: () => setIsModalOpen(true) }
                : undefined
          }
          className="bg-paper-white text-ink"
        />
      );
    }

    if (displayMode === 'grid') {
      return (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <article key={product._id} className="group flex min-w-0 flex-col bg-paper-white text-ink">
              <ProductPhoto
                product={product}
                sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                className="h-36 w-full"
                iconClassName="h-10 w-10"
              />
              <div className="flex flex-1 flex-col p-3 sm:p-4">
                <h3 className="flex items-start justify-between gap-2 text-base font-semibold leading-snug">
                  <span className="min-w-0 break-words">{product.name}</span>
                  {product.pinned && <PinMark color={primaryColor} />}
                  {product.isActive === false && <InactiveTag label={productsDict.statusInactive} />}
                </h3>
                {product.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink/60">{product.description}</p>
                )}
                <div className="mt-2">
                  <ProductMeta product={product} skuLabel={productsDict.sku} variationCount={productsDict.variationCount} />
                </div>
                <div className="mt-auto pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-ink/30 pt-3">
                    <Currency amount={product.price} className="min-w-0 break-all font-receipt text-lg font-semibold sm:text-xl" />
                    {showStock(product) && <StockTag stock={productStockTotal(product)} threshold={lowStockThreshold(product)} label={productsDict.inStock} />}
                  </div>
                </div>
              </div>
              {renderKeys(product, 'strip')}
            </article>
          ))}
        </div>
      );
    }

    return (
      <div>
        <div className="bg-paper-white text-ink">
          <div className="hidden items-center gap-3 border-b border-dashed border-ink/30 px-4 py-2 font-receipt text-xs font-medium uppercase tracking-[0.14em] text-ink/60 md:flex">
            <span className="flex-1">{productsDict.name}</span>
            <span className="w-32 text-right">{productsDict.price}</span>
            {inventoryEnabled && <span className="w-28 text-right">{productsDict.stock}</span>}
            <span className="shrink-0" style={{ width: keyCount * 44 + 2 }} aria-hidden />
          </div>
          <div className="divide-y divide-dashed divide-ink/20">
            {products.map((product) => (
              <div key={product._id} className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors hover:bg-paper md:flex-nowrap">
                <div className="flex min-w-0 basis-full items-center gap-3 md:flex-1 md:basis-0">
                  <ProductPhoto product={product} sizes="40px" className="h-10 w-10" iconClassName="h-4 w-4" />
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold sm:text-base">
                      <span className="truncate">{product.name}</span>
                      {product.pinned && <PinMark color={primaryColor} />}
                      {product.isActive === false && <InactiveTag label={productsDict.statusInactive} />}
                    </h3>
                    <ProductMeta product={product} skuLabel={productsDict.sku} variationCount={productsDict.variationCount} />
                  </div>
                  <span className="mk-leader hidden md:block" aria-hidden />
                </div>
                <Currency amount={product.price} className="whitespace-nowrap font-receipt text-base font-semibold md:w-32 md:text-right" />
                {inventoryEnabled && (
                  <div className="md:w-28 md:text-right">
                    {showStock(product) && <StockTag stock={productStockTotal(product)} threshold={lowStockThreshold(product)} label={productsDict.inStock} />}
                  </div>
                )}
                <div className="ml-auto shrink-0">{renderKeys(product, 'row')}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mk-tear-b h-3 bg-paper-white" aria-hidden />
      </div>
    );
  };

  const viewModes = [
    { mode: 'grid', label: dict.common.gridView || 'Grid View', Icon: LayoutGrid },
    { mode: 'list', label: dict.common.listView || 'List View', Icon: List },
  ] as const;
  const pageKey = 'flex min-h-[44px] w-full items-center justify-center border border-white/25 px-5 font-receipt text-xs font-medium uppercase text-paper transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation sm:w-auto';

  return (
    <>
      {ConfirmDialog}
      <PageTitle />
      <div className={`${marketingFontClasses} mk-root pos-register flex min-h-dvh flex-col`}>
        <Navbar />
        <div className="flex-1 bg-brand-navy-deep text-paper">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                {settings?.companyName && (
                  <LineTag no="PLU" className="mb-3 text-[#8fe3d0]">{settings.companyName}</LineTag>
                )}
                <h1 className="text-5xl text-paper-white sm:text-6xl lg:text-7xl">{productsDict.title}</h1>
              </div>
              <div className="flex shrink-0 items-stretch gap-3">
                <div className="flex items-center gap-3 border border-white/10 bg-black/30 px-4 py-2">
                  <span className="mk-led-glow font-led text-4xl leading-none text-[#7df0d6]">
                    {status === 'ready' ? total : '---'}
                  </span>
                  <span className="font-receipt text-xs uppercase tracking-[0.14em] text-white/60">{dict.common.items}</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-paper-white px-3 font-receipt text-xs font-medium uppercase text-ink transition-colors hover:bg-paper sm:flex-none sm:px-5 sm:text-sm"
                  >
                    <Plus className={ICON} strokeWidth={1.75} aria-hidden />
                    {productsDict.addProduct}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <input
                  type="text"
                  placeholder={productsDict.searchPlaceholder}
                  aria-label={productsDict.searchPlaceholder}
                  value={search}
                  onChange={(e) => applyFilter(() => setSearch(e.target.value))}
                  className="w-full border-2 border-transparent bg-paper-white py-2.5 pl-11 pr-4 font-receipt text-base text-ink placeholder:text-ink/50 focus:border-[#8fe3d0] focus:outline-none"
                />
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/50" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="flex shrink-0 divide-x divide-white/25 border border-white/25">
                {viewModes.map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDisplayMode(mode)}
                    aria-pressed={displayMode === mode}
                    title={label}
                    aria-label={label}
                    className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 font-receipt text-xs font-medium uppercase transition-colors sm:flex-none ${
                      displayMode === mode ? 'bg-paper-white text-ink' : 'text-paper hover:bg-white/10'
                    }`}
                  >
                    <Icon className={ICON} strokeWidth={1.75} aria-hidden />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="col-span-2 md:col-span-1">
                <label htmlFor="products-category" className={FILTER_LABEL}>{productsDict.category || 'Category'}</label>
                <select id="products-category" value={category} onChange={(e) => applyFilter(() => setCategory(e.target.value))} className={FILTER_FIELD}>
                  <option value="">{productsDict.allCategories || 'All categories'}</option>
                  {categories.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="products-status" className={FILTER_LABEL}>{productsDict.status || 'Status'}</label>
                <select id="products-status" value={activity} onChange={(e) => applyFilter(() => setActivity(e.target.value as CatalogActivity))} className={FILTER_FIELD}>
                  <option value="active">{productsDict.statusActive || 'Active'}</option>
                  <option value="inactive">{productsDict.statusInactive || 'Inactive'}</option>
                  <option value="all">{productsDict.statusAll || 'All'}</option>
                </select>
              </div>
              <div>
                <label htmlFor="products-sort" className={FILTER_LABEL}>{productsDict.sortBy || 'Sort by'}</label>
                <select id="products-sort" value={sort} onChange={(e) => applyFilter(() => setSort(e.target.value as CatalogSort))} className={FILTER_FIELD}>
                  {sortOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>

            {renderProductContent()}

            {totalPages > 1 && (
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={pageKey}
                >
                  {dict.common?.previous || 'Previous'}
                </button>
                <span className="mk-led-glow px-3 font-led text-2xl leading-none text-[#7df0d6]">
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={pageKey}
                >
                  {dict.common?.next || 'Next'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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
    </>
  );
}
