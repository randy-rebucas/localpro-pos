'use client';

import { useCallback, useEffect, useState } from 'react';
import { getOfflineStorage } from '@/lib/offline-storage';

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
}

export type ProductsStatus = 'loading' | 'ready' | 'error';
export type ProductsSource = 'server' | 'cache' | 'none';

interface UsePosProductsOptions {
  tenant: string;
  debouncedSearch: string;
  isOnline: boolean;
  fetchWithTimeout: (url: string, options?: RequestInit, timeoutMs?: number) => Promise<Response>;
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

  const filterCached = useCallback(
    (cached: PosProduct[]) => {
      if (!debouncedSearch) return cached;
      const searchLower = debouncedSearch.toLowerCase();
      return cached.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.sku?.toLowerCase().includes(searchLower) ||
          p.category?.toLowerCase().includes(searchLower)
      );
    },
    [debouncedSearch]
  );

  const loadFromCache = useCallback(async (): Promise<PosProduct[]> => {
    const storage = await getOfflineStorage();
    const cached = await storage.getCachedProducts(tenant);
    return filterCached(cached as PosProduct[]);
  }, [tenant, filterCached]);

  const fetchProducts = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      if (isOnline) {
        try {
          const res = await fetchWithTimeout(
            `/api/products?search=${encodeURIComponent(debouncedSearch)}&tenant=${tenant}`
          );
          const data = await res.json();
          if (data.success) {
            setProducts(data.data);
            setSource('server');
            setStatus('ready');
            const storage = await getOfflineStorage();
            await storage.cacheProducts(data.data, tenant);
            try {
              const discountRes = await fetch(`/api/discounts?tenant=${tenant}`);
              const discountData = await discountRes.json();
              if (discountData.success && discountData.data) {
                await storage.cacheDiscounts(discountData.data, tenant);
              }
            } catch {
              // best-effort discount cache
            }
            return;
          }
          throw new Error(data.error || 'Failed to fetch products');
        } catch (fetchErr) {
          const cached = await loadFromCache();
          if (cached.length > 0) {
            setProducts(cached);
            setSource('cache');
            setStatus('ready');
            setError(null);
            return;
          }
          throw fetchErr;
        }
      } else {
        const cached = await loadFromCache();
        if (cached.length > 0) {
          setProducts(cached);
          setSource('cache');
          setStatus('ready');
        } else {
          setProducts([]);
          setSource('none');
          setStatus('error');
          setError('No cached products available offline');
        }
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      try {
        const cached = await loadFromCache();
        if (cached.length > 0) {
          setProducts(cached);
          setSource('cache');
          setStatus('ready');
        } else {
          setProducts([]);
          setSource('none');
          setStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to load products');
        }
      } catch {
        setProducts([]);
        setSource('none');
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to load products');
      }
    }
  }, [debouncedSearch, tenant, isOnline, loadFromCache, fetchWithTimeout]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const setProductsOptimistic = useCallback((updater: PosProduct[] | ((prev: PosProduct[]) => PosProduct[])) => {
    setProducts(updater);
  }, []);

  return {
    products,
    setProducts: setProductsOptimistic,
    status,
    source,
    error,
    refetch: fetchProducts,
  };
}
