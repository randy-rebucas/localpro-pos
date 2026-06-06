'use client';

import { useCallback, useEffect, useState } from 'react';

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

export function useProductsCatalog(tenant: string, search: string) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}&tenant=${tenant}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
        setStatus('ready');
      } else {
        setError(data.error || 'Failed to load products');
        setProducts([]);
        setStatus('error');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
      setProducts([]);
      setStatus('error');
    }
  }, [search, tenant]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { products, setProducts, status, error, refetch };
}
