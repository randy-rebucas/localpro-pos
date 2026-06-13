import { useCallback, useRef, useState } from 'react';
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

export const useProductsList = (_tenant: string) => {
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
        setMessage({ type: 'error', text: data.error || 'Failed to fetch products' });
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessage({ type: 'error', text: 'Failed to fetch products' });
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    abortControllerRef.current = controller;

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
        return { success: false, error: data.error || 'Failed to delete product' };
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        return { success: false, error: 'Failed to delete product' };
      }
      return { success: false, error: 'Request timeout' };
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

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
        'Failed to update products';
      return { success: false as const, error: errorMsg };
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        return { success: false as const, error: 'Failed to update products' };
      }
      return { success: false as const, error: 'Request timeout' };
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

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
