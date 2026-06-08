'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOfflineStorage } from '@/lib/offline-storage';
import type { ProductSaleUnit } from '@/lib/product-units';

export interface PosProduct {
  _id: string;
  name: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  image?: string;
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
  serviceType?: string;
  modifiers?: Array<{ name: string; options: Array<{ name: string; price: number }>; required: boolean }>;
  hasVariations?: boolean;
  variations?: Array<{
    size?: string;
    color?: string;
    type?: string;
    sku?: string;
    price?: number;
    stock?: number;
  }>;
  branchStock?: Array<{ branchId: string; stock: number }>;
  baseUnit?: string;
  saleUnits?: ProductSaleUnit[];
}

export type ProductsStatus = 'loading' | 'ready' | 'error';
export type ProductsSource = 'server' | 'cache' | 'none';

const PAGE_SIZE = 40;

interface UsePosProductsOptions {
  tenant: string;
  debouncedSearch: string;
  isOnline: boolean;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
}

function mergeProductsById(existing: PosProduct[], incoming: PosProduct[]): PosProduct[] {
  const map = new Map(existing.map((product) => [product._id, product]));
  for (const product of incoming) {
    map.set(product._id, product);
  }
  return Array.from(map.values());
}

export function usePosProducts({
  tenant,
  debouncedSearch,
  isOnline,
  fetchWithTimeout,
}: UsePosProductsOptions) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [status, setStatus] = useState<ProductsStatus>('loading');
  const [source, setSource] = useState<ProductsSource>('none');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const pageRef = useRef(1);
  const fetchIdRef = useRef(0);
  const offlineCatalogRef = useRef<PosProduct[]>([]);

  const filterCached = useCallback(
    (cached: PosProduct[]) => {
      if (!debouncedSearch) return cached;
      const searchLower = debouncedSearch.toLowerCase();
      return cached.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.sku?.toLowerCase().includes(searchLower) ||
          p.barcode?.toLowerCase().includes(searchLower) ||
          p.category?.toLowerCase().includes(searchLower) ||
          p.saleUnits?.some(
            (u) =>
              u.label.toLowerCase().includes(searchLower) ||
              u.barcode?.toLowerCase().includes(searchLower)
          )
      );
    },
    [debouncedSearch]
  );

  const loadFromCache = useCallback(async (): Promise<PosProduct[]> => {
    const storage = await getOfflineStorage();
    const cached = await storage.getCachedProducts(tenant);
    return filterCached(cached as PosProduct[]);
  }, [tenant, filterCached]);

  const cacheProductsMerged = useCallback(
    async (incoming: PosProduct[]) => {
      const storage = await getOfflineStorage();
      const cached = (await storage.getCachedProducts(tenant)) as PosProduct[];
      await storage.cacheProducts(mergeProductsById(cached, incoming), tenant);
    },
    [tenant]
  );

  const applyOfflinePage = useCallback((catalog: PosProduct[], page: number, append: boolean) => {
    const end = page * PAGE_SIZE;
    const nextSlice = catalog.slice(0, end);
    setProducts((prev) => (append ? nextSlice : nextSlice));
    setHasMore(end < catalog.length);
    pageRef.current = page;
    setSource('cache');
    setStatus('ready');
    setError(null);
  }, []);

  const fetchProducts = useCallback(
    async (page: number, append: boolean) => {
      const fetchId = ++fetchIdRef.current;

      if (append) {
        setLoadingMore(true);
      } else {
        setStatus('loading');
        setError(null);
        setHasMore(false);
        pageRef.current = 1;
      }

      try {
        if (!isOnline) {
          if (!append) {
            offlineCatalogRef.current = await loadFromCache();
          }
          if (fetchId !== fetchIdRef.current) return;

          if (offlineCatalogRef.current.length > 0) {
            applyOfflinePage(offlineCatalogRef.current, page, append);
          } else {
            setProducts([]);
            setSource('none');
            setStatus('error');
            setError('No cached products available offline');
            setHasMore(false);
          }
          return;
        }

        const res = await fetchWithTimeout(
          `/api/products?search=${encodeURIComponent(debouncedSearch)}&tenant=${tenant}&page=${page}&limit=${PAGE_SIZE}`
        );
        const data = await res.json();
        if (fetchId !== fetchIdRef.current) return;

        if (data.success) {
          const incoming = (data.data || []) as PosProduct[];
          const pages = data.pagination?.pages ?? 1;

          setProducts((prev) => (append ? [...prev, ...incoming] : incoming));
          setSource('server');
          setStatus('ready');
          setHasMore(page < pages);
          pageRef.current = page;
          setError(null);

          await cacheProductsMerged(incoming);

          if (page === 1) {
            try {
              const discountRes = await fetch(`/api/discounts?tenant=${tenant}`);
              const discountData = await discountRes.json();
              if (discountData.success && discountData.data) {
                const storage = await getOfflineStorage();
                await storage.cacheDiscounts(discountData.data, tenant);
              }
            } catch {
              // best-effort discount cache
            }
          }
          return;
        }

        throw new Error(data.error || 'Failed to fetch products');
      } catch (fetchErr) {
        if (fetchId !== fetchIdRef.current) return;

        if (!append) {
          try {
            offlineCatalogRef.current = await loadFromCache();
            if (fetchId !== fetchIdRef.current) return;

            if (offlineCatalogRef.current.length > 0) {
              applyOfflinePage(offlineCatalogRef.current, 1, false);
              return;
            }
          } catch {
            // fall through to error state
          }
        }

        if (!append) {
          setProducts([]);
          setSource('none');
          setStatus('error');
          setError(fetchErr instanceof Error ? fetchErr.message : 'Failed to load products');
          setHasMore(false);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoadingMore(false);
        }
      }
    },
    [
      applyOfflinePage,
      cacheProductsMerged,
      debouncedSearch,
      fetchWithTimeout,
      isOnline,
      loadFromCache,
      tenant,
    ]
  );

  useEffect(() => {
    fetchProducts(1, false);
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || status === 'loading') return;
    fetchProducts(pageRef.current + 1, true);
  }, [fetchProducts, hasMore, loadingMore, status]);

  const setProductsOptimistic = useCallback((updater: PosProduct[] | ((prev: PosProduct[]) => PosProduct[])) => {
    setProducts(updater);
  }, []);

  return {
    products,
    setProducts: setProductsOptimistic,
    status,
    source,
    error,
    hasMore,
    loadingMore,
    loadMore,
    refetch: () => fetchProducts(1, false),
  };
}
