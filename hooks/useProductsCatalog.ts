'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CatalogProduct {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  image?: string;
  category?: string;
  categoryId?: string | { name?: string } | null;
  pinned?: boolean;
  isActive?: boolean;
  lowStockThreshold?: number;
  hasVariations?: boolean;
  variations?: Array<{ _id?: string; size?: string; color?: string; type?: string; sku?: string; price?: number; stock?: number }>;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
}

export type CatalogStatus = 'loading' | 'ready' | 'error';
export type CatalogActivity = 'active' | 'inactive' | 'all';
export type CatalogSort = 'newest' | 'name' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

export interface CatalogQuery {
  search: string;
  page: number;
  pageSize: number;
  category: string;
  activity: CatalogActivity;
  sort: CatalogSort;
}

const IS_ACTIVE_PARAM: Record<CatalogActivity, string> = { active: 'true', inactive: 'false', all: 'all' };

const SEARCH_DEBOUNCE_MS = 300;

export function useProductsCatalog(tenant: string, { search, page, pageSize, category, activity, sort }: CatalogQuery) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  // Debounce the search term so typing doesn't refetch the catalog on every
  // keystroke. Clearing the search applies immediately.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search),
      search === '' ? 0 : SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [search]);

  const refetch = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        page: String(page),
        limit: String(pageSize),
        isActive: IS_ACTIVE_PARAM[activity],
        tenant,
      });
      if (category) params.set('categoryName', category);
      if (sort !== 'newest') params.set('sort', sort);
      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      // Ignore responses superseded by a newer request
      if (requestId !== requestIdRef.current) return;
      if (data.success) {
        setProducts(data.data);
        setTotal(data.pagination?.total ?? data.data.length);
        setTotalPages(data.pagination?.pages ?? 1);
        setStatus('ready');
      } else {
        setError(data.error || 'Failed to load products');
        setProducts([]);
        setStatus('error');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching products:', err);
      setError('Failed to load products');
      setProducts([]);
      setStatus('error');
    }
  }, [debouncedSearch, tenant, page, pageSize, category, activity, sort]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { products, setProducts, total, totalPages, status, error, refetch };
}
