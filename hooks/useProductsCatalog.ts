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
  pinned?: boolean;
  trackInventory?: boolean;
  allowOutOfStockSales?: boolean;
}

export type CatalogStatus = 'loading' | 'ready' | 'error';

const SEARCH_DEBOUNCE_MS = 300;

export function useProductsCatalog(tenant: string, search: string) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
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
      const res = await fetch(`/api/products?search=${encodeURIComponent(debouncedSearch)}&tenant=${tenant}`);
      const data = await res.json();
      // Ignore responses superseded by a newer request
      if (requestId !== requestIdRef.current) return;
      if (data.success) {
        setProducts(data.data);
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
  }, [debouncedSearch, tenant]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { products, setProducts, status, error, refetch };
}
