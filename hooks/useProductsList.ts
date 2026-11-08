import { useCallback, useEffect, useRef, useState } from 'react';
import type { BulkProductUpdates } from '@/lib/validation';

export interface Product {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  sku?: string;
  barcode?: string;
  category?: string;
  categoryId?: {
    _id: string;
    name: string;
  } | string;
  image?: string;
  productType: 'regular' | 'bundle' | 'service';
  hasVariations: boolean;
  variations?: Record<string, unknown>[];
  trackInventory: boolean;
  lowStockThreshold?: number;
  createdAt: string;
  modifiers?: Array<{
    name: string;
    options: Array<{ name: string; price: number }>;
    required: boolean;
  }>;
  allergens?: string[];
  nutritionInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  serviceType?: 'wash' | 'dry-clean' | 'press' | 'repair' | 'other';
  weightBased?: boolean;
  pickupDelivery?: boolean;
  estimatedDuration?: number;
  serviceDuration?: number;
  staffRequired?: number;
  equipmentRequired?: string[];
  isActive?: boolean;
}

export interface Category {
  _id: string;
  name: string;
}

export interface ProductsPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface FetchProductsOptions {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | null | 'all';
  filter?: 'all' | 'missing-barcode' | 'missing-image';
}

type Dict = { products?: Record<string, string | undefined>; common?: Record<string, string | undefined> } | null | undefined;

export const useProductsList = (_tenant: string, dict?: Dict) => {
  // Read through a ref so the dictionary arriving doesn't recreate the callbacks (and refetch)
  const dictRef = useRef<Dict>(dict);
  useEffect(() => {
    dictRef.current = dict;
  }, [dict]);
  const text = useCallback((key: string, fallback: string) => dictRef.current?.products?.[key] || fallback, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<ProductsPagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProducts = useCallback(async (options: FetchProductsOptions = {}) => {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const search = options.search?.trim() ?? '';

    // A newer search supersedes the one in flight: cancel it, so a slow
    // response for "ab" can't land after the one for "abc"
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set('search', search);
      if (options.isActive === true) {
        params.set('isActive', 'true');
      } else if (options.isActive === false) {
        params.set('isActive', 'false');
      } else if (options.isActive === 'all') {
        params.set('isActive', 'all');
      }
      if (options.filter && options.filter !== 'all') {
        params.set('filter', options.filter);
      }

      const res = await fetch(`/api/products?${params}`, { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (abortControllerRef.current !== controller) return; // superseded
      if (data.success) {
        setProducts(data.data);
        if (data.pagination) {
          setPagination(data.pagination);
        } else {
          setPagination({
            page,
            limit,
            total: data.data.length,
            pages: 1,
          });
        }
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: data.error || text('fetchError', 'Failed to fetch products') });
      }
    } catch (error) {
      if (abortControllerRef.current !== controller) return; // superseded: the newer request reports
      setMessage({
        type: 'error',
        text: (error as Error).name === 'AbortError' ? text('requestTimeout', 'Request timed out') : text('fetchError', 'Failed to fetch products'),
      });
    } finally {
      clearTimeout(timeoutId);
      if (abortControllerRef.current === controller) setLoading(false);
    }
  }, [text]);

  const fetchCategories = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch('/api/categories', { credentials: 'include', signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        setCategories(data.data);
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Error fetching categories:', error);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const deleteProduct = useCallback(async (productId: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        credentials: 'include',
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.filter((p) => p._id !== productId));
        return { success: true };
      } else {
        return { success: false, error: data.error || text('deleteError', 'Failed to delete product') };
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        return { success: false, error: text('deleteError', 'Failed to delete product') };
      }
      return { success: false, error: text('requestTimeout', 'Request timed out') };
    } finally {
      clearTimeout(timeoutId);
    }
  }, [text]);

  const updateMessage = useCallback((msg: { type: 'success' | 'error'; text: string } | null) => {
    setMessage(msg);
  }, []);

  const bulkUpdateProducts = useCallback(async (productIds: string[], updates: BulkProductUpdates) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('/api/products/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productIds, action: 'update', updates }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.success) {
        return { success: true as const, message: data.message as string, modifiedCount: data.modifiedCount as number };
      }
      const errorMsg =
        data.error ||
        (Array.isArray(data.errors) ? data.errors.map((e: { message: string }) => e.message).join(', ') : null) ||
        text('bulkUpdateError', 'Failed to update products');
      return { success: false as const, error: errorMsg };
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        return { success: false as const, error: text('bulkUpdateError', 'Failed to update products') };
      }
      return { success: false as const, error: text('requestTimeout', 'Request timed out') };
    } finally {
      clearTimeout(timeoutId);
    }
  }, [text]);

  return {
    products,
    categories,
    loading,
    pagination,
    message,
    fetchProducts,
    fetchCategories,
    deleteProduct,
    updateMessage,
    bulkUpdateProducts,
  };
};
